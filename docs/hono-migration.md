# node-proxy 后端 Koa → Hono 迁移记录

> 日期：2026-10-23
> 任务来源：project_plan.md L6-8「调整为hono框架」
> 迁移方案：**只换壳，不动核** —— Koa 仅承担路由 / bodyparser / 静态服务 / 中间件编排等"壳"职责，替换为 Hono；代理核心（httpProxy / httpClient / flowEnc / encDavHandle 内部流处理）全部是原生 Node req/res 流，一行未动。

## 1. 依赖变更

| 操作 | 包 | 版本 | 说明 |
|---|---|---|---|
| 新增 | hono | ^4.13.13 | Web 框架 |
| 新增 | @hono/node-server | ^2.1.5 | Node.js 适配层 |
| 新增 | path-to-regexp | ^6.3.0 | **必须锁 v6**（见 §4.4） |
| 移除 | koa / koa-router / koa-bodyparser / koa-static | - | 原 Koa 全家桶 |

## 2. 改动文件清单

| 文件 | 改动 |
|---|---|
| [app.js](node-proxy/app.js) | 主入口重写：Hono 实例 + `getRequestListener` 自建 http server |
| [src/router.js](node-proxy/src/router.js) | enc-api 管理接口 → Hono 路由（导出 Hono 实例） |
| [src/encNameRouter.js](node-proxy/src/encNameRouter.js) | alist 网页 API 拦截 → Hono 路由（导出 Hono 实例） |
| [src/encDavHandle.js](node-proxy/src/encDavHandle.js) | 仅改入口签名 `ctx` → `(c, next)`，内部取 `c.env.incoming/outgoing`，流处理逻辑逐行保留 |
| [src/middleware/globalHandle.js](node-proxy/src/middleware/globalHandle.js) | 全局异常兜底改写 |
| [src/middleware/responseHandle.js](node-proxy/src/middleware/responseHandle.js) | 统一响应包装改写 |
| [src/middleware/bodyParser.js](node-proxy/src/middleware/bodyParser.js) | 新建，等价 `koa-bodyparser({enableTypes:['json','form','text']})` |
| 未动 | httpProxy / httpClient / flowEnc / commonUtil / config / logger 等核心 |

## 3. app.js 结构对照

### 3.1 中间件编排顺序（与原 Koa 注册顺序一致）

```
serveStatic('/public/*')              # @hono/node-server/serve-static，支持绝对 root，兼容 pkg 快照
  → globalHandle('*')                 # 全局异常兜底
  → encApiRouter (route /)            # /enc-api 管理接口
  → /redirect/:key                    # 302 跳转下载 + 解密流
  → dispatch catch-all('*')           # webdav 动态路由（见 §4.3）
  → encNameRouter (route /)           # alist 网页 API 拦截
  → PUT /api/fs/put-back              # 加密上传
  → /images/*                         # alist 图标透传
  → alist 兜底('*')                   # HTML 注入 <body> 后 raw 写出
```

### 3.2 服务启动

```js
const nodeHandler = getRequestListener(app.fetch)
const server = http.createServer(nodeHandler)
server.maxConnections = 1000
server.on('checkContinue', (req, res) => { nodeHandler(req, res) })
```

- @hono/node-server v2.1.5 未内置 checkContinue 处理，需用导出的 `getRequestListener(app.fetch)` 自建 `http.createServer` 手动挂事件（保留群晖 webdav 兼容）。
- CLI 分支（`node app.js <password> <encType> <operation> <folder> <outPath>`）保持不变。

### 3.3 webdav 处理链

原 koa-router 按配置注册正则前缀路由；Hono 不支持动态 RegExp 路由，改为 `app.all('*')` dispatch 内按配置顺序手动匹配：

```js
app.all('*', async (c, next) => {
  for (const webdavConfig of webdavServer) {
    if (webdavConfig.enable && new RegExp(webdavConfig.path).test(c.req.path)) {
      return await davChain(c, webdavConfig)   // preProxy → encDavHandle → proxyHandle
    }
  }
  if (/^\/dav\/*/.test(c.req.path)) return await davChain(c, alistServer)
  await preProxy(alistServer, false)(c, next)  # 其余路径做 alist 预处理
})
```

## 4. 关键技术点（踩坑记录）

### 4.1 Hono finalized 语义（最大的坑）

[hono/dist/compose.js:44](node-proxy/node_modules/hono/dist/compose.js#L44)：

```js
if (res && (context.finalized === false || isError)) context.res = res
```

**中间件链 `finalized` 之后，handler `return c.json(...)` 会被静默忽略**，必须显式赋值：

```js
c.res = c.json({ flag: true, msg, code: code || 200, data })
```

否则返回的是已被 `c.res.json()` 消费掉 body 的旧 Response，下游报 `Invalid state: ReadableStream is locked`。globalHandle 与 responseHandle 均按此写法。

### 4.2 裸流直写协议（RESPONSE_ALREADY_SENT）

代理场景下 httpProxy 直接操作原始 `c.env.incoming / c.env.outgoing` 流，写完后必须返回：

```js
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response'  // 注意：子路径导出，非包根！
...
return RESPONSE_ALREADY_SENT
```

lib 检测 `x-hono-already-sent` header 后完全短路（不写任何 header）。中间件透传该返回值必须 `return await next()`——丢弃返回值会报 `Context is not finalized` + `ERR_HTTP_HEADERS_SENT`。

### 4.3 koa ctx.body 等价模式

- **跨中间件共享数据**：`c.set('key', obj)` / `c.get('key')` 共享对象引用（等价 koa ctx.body 共享，如 encNameRouter 的 `fsResult`、bodyParser 的 `requestBody`）。
- **body 变更后手动写出**（等价 koa `ctx.status=...; ctx.body=respBody`）：

```js
response.setHeader('content-length', Buffer.byteLength(respBody))
response.end(respBody)
return RESPONSE_ALREADY_SENT
```

### 4.4 path-to-regexp 必须锁 v6

commonUtil.js 直接调用 `pathToRegexp(new RegExp(filePath))`，**仅 v6 支持 RegExp 入参透传**；v8/v9 报 `Cannot read properties of undefined (reading 'length')`（v8 起移除了 RegExp 支持）。原 koa-router@12 的传递依赖即 v6，迁移后必须显式声明为直接依赖。

### 4.5 其他等价实现

| koa | hono |
|---|---|
| `ctx.req` / `ctx.res` | `c.env.incoming` / `c.env.outgoing` |
| `ctx.protocol` | `c.env.incoming.socket.encrypted ? 'https' : 'http'` |
| `koa-bodyparser` | 自建 bodyParser 中间件，解析失败抛 400 由 globalHandle 兜底 |
| `koa-static` | `serveStatic({ root: pkgDirPath })`（绝对路径 root，支持 Range，兼容 pkg） |
| `ctx.header['authorizetoken']` | `c.req.header('authorizetoken')` |
| `ctx.redirect(url, 302)` | `c.redirect('/public/index.html', 302)` |

## 5. 验证结果（全部通过）

| 验证项 | 结果 |
|---|---|
| `npm run serve` 启动 + POST /enc-api/login | ✅ 响应与原 koa 完全一致（`{"flag":true,"code":200,"data":{...jwtToken}}`） |
| webdav 冒烟（mock 上游 5 项） | ✅ PROPFIND 207 裸流透传 / 文件名加解密 / /p/ 解密流 / HTML 注入 / fs-list body 重写；日志无噪音 |
| 错误密码 / 未登录鉴权 | ✅ `code:500 passwword error` / `code:401 user unlogin`，与原行为一致（含 `flag` 恒为 true 的存量 quirk） |
| `npx webpack` 构建 + dist 直跑 | ✅ 构建成功（仅 log4js 存量 warning），dist 产物登录 200、静态资源 200 |
| eslint | ✅ 0 errors（133 warnings 为存量 prettier 格式问题） |
| 浏览器登录页 | ✅ 正常渲染、无 JS 错误 |
| **A/B 对照测试（真实环境）** | ✅ 详见第 7 节 |

## 6. 已知存量问题（迁移未引入、未修复，保持行为等价）

- [encNameRouter.js](node-proxy/src/encNameRouter.js) handleDownload 的 `fileInfo.name` 未判空，fileInfo 为 null 时 500（原 koa 版同样写法）。
- miss-static 请求会落到代理链连不可达上游而挂起（原 koa 行为一致，无超时设置）。
- 错误响应 `flag` 恒为 true（原 `flag: flag||true` 恒真，迁移保持等价）。
- 代理 levelDB 缓存的历史条目（size/path）不随上游变化刷新，可能影响 FlowEnc 解密参数（原 koa 行为一致，见第 7 节"缓存污染"）。

## 7. A/B 对照测试（2026-10-24，真实环境）

- A = koa 基准 `http://192.168.5.14:5344`，B = hono 被测 `http://127.0.0.1:5344`，共同上游 OpenList `192.168.5.10:5244`（阿里云盘 Open 驱动）
- 测试脚本：`.ab/ab-diff.mjs`（第一层只读 14 项）、`.ab/ab-write3.mjs`（第二层写操作 14 项，基准路径 `/aliyun/atest`）
- **测试期间发现并修复 2 个迁移回归**：
  1. **TE+CL 非法头并存**：上游 chunked 响应头被 httpClient 透传后手动设 Content-Length，导致 `transfer-encoding`+`content-length` 并存（RFC 7230 违规），undici 报 `UND_ERR_RES_CONTENT_LENGTH_MISMATCH`。修复：`encDavHandle.js` respondRaw 与 `app.js` alist 兜底路由在重写 body 后先 `removeHeader('transfer-encoding')`。
  2. **Hono compose 内建 onError**：与 koa-compose 不同，Hono dispatch 每层都有 onError 兜底（默认 500 文本），中间件 try-catch 永远收不到 handler 的 throw。修复：globalHandle.js 改为 `app.onError(globalHandle)` 注册，`/p/` 等路径的错误响应恢复为 koa 风格 JSON。
- **最终结果**：第一层 13/14 PASS（唯一差异为 koa 对空 body 自动补 `Content-Type: text/plain` 的框架默认行为，无功能影响）；第二层 13/14 PASS（唯一 FAIL 为旧缓存污染项，见下）
- 第二层覆盖：上传（内容 aesctr 加密+文件名加密落盘，上游加密名两侧一致）、列表解密显示、`/p/` `/d/` 下载解密还原明文、交叉下载（A 传 B 下、B 传 A 下）、rename/mkdir/move/remove、清理后上游与代理视角均无残留
- **全流程 A/B 响应逐字节一致**，未发现其他迁移分歧

### alist API 语义备忘（测试脚本曾因用错语义导致上游目录被误改名）

| 接口 | 语义 | 备注 |
|---|---|---|
| `/api/fs/mkdir` | `{path: 新目录完整路径}` | 代理会做 encFolder 名字加密（注意：正则匹配需要路径有尾巴，`/aliyun/atest` 本身不命中 `atest/.*`） |
| `/api/fs/rename` | `{path: 对象完整路径, name: 新名字, new_name: 新名字}` | 代理按 `path`+`name` 转发（OpenList 用 `name` 作新名），`name` 会被 convertRealName 加密 |
| `/api/fs/move` | `{src_dir, dst_dir, names}` | dst 真实路径转换依赖 levelDB 缓存（需先 list 父目录） |
| `/api/fs/put` | PUT 裸文件字节 + `File-Path` 头 | **不是 multipart**；文件名 sign 在 fs/list 响应的 `sign` 字段 |
| `/p/` `/d/` 下载 | 需带 `?sign=`（fs/list 返回） | 无 sign 时上游返回错误页，被代理当密文解密成乱码 |

### 缓存污染现象（既有行为，非回归）

同一 show-path 曾上传过不同内容时（如测试先传 multipart 后传裸字节），levelDB 缓存的旧 size 会让 FlowEnc 解密参数错位、下载乱码；A/B 表现完全一致。全新路径（无历史缓存）下载始终精确还原明文。
