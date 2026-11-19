# tjs 运行时部署说明

> 适用分支：`txiki`。本文只描述 txiki.js 侧；node 运行时（`node app.js`）行为与之前完全一致。

## 1. 双二进制怎么选

| 产物 | 链接方式 | chacha20 内核 | 建议场景 |
|---|---|---|---|
| `tjs-glibc` | 动态（glibc 2.17 基线） | FFI 调系统 libcrypto / libnettle | 主力，glibc 发行版 / NAS / Docker |
| `tjs-musl` | 全静态单文件 | 纯 JS（musl 无法 dlopen） | 任意 Linux 直接跑，无需依赖 |

构建：`tjs-build/build-tjs.sh`（产物落在 `tjs-build/dist/`，68MB 级二进制不入 git）。

## 2. 启动

```bash
cd node-proxy
../tjs-build/dist/tjs-glibc run --import-map tjs.importmap.json app.tjs.js
```

必须在 `node-proxy` 目录下启动：`conf/`、`logs/`、`public/` 全部按 **cwd** 解析，换目录会读不到配置。

## 3. CLI 批量加解密在 tjs 下不可用

`convertFile`（`node app.js <password> <encType> <enc|dec> <folder> <outPath> [encName]`）
依赖 node 的 fs 流，tjs 入口不提供。传入额外参数时会直接报错退出（退出码 1），不会误起服务。

需要批量加解密时请用 node 运行时执行上述命令。

## 4. 自签 https 上游证书（重点）

node 版对上游 https 是进程级放开（`NODE_TLS_REJECT_UNAUTHORIZED=0`，等价 koa 原版 per-request
`rejectUnauthorized:false`）。**tjs 的 fetch 没有 per-request 证书选项**，只能提供 CA bundle：

优先级：`--tls-ca <file>` > `TJS_CA_BUNDLE` > `SSL_CERT_FILE` > 内置 bundle

注意这是**替换**而非追加——指定的 PEM 会顶替内置 bundle，所以要么给完整 CA 集，要么把自签 CA
拼到系统证书后面：

```bash
cat /etc/ssl/certs/ca-certificates.crt ./my-ca.crt > /path/bundle.pem
TJS_CA_BUNDLE=/path/bundle.pem ../tjs-build/dist/tjs-glibc run --import-map tjs.importmap.json app.tjs.js
```

未配置而访问自签上游时，代理会在首次请求处打一条 warn 提示（`proxyCommon.js` 的 `relaxTlsOnce`）。

## 5. 加密性能

P3 基准实测（同一台机器）：

| 算法 | tjs-glibc | tjs-musl |
|---|---|---|
| aesctr（推荐） | ~193 MB/s | ~193 MB/s |
| chacha20 | ~1.3 GB/s（EVP） | **~1 MB/s**（纯 JS 降级） |

musl 版 chacha20 的降级来自 musl 不支持 `dlopen` 这一硬限制，不是缺陷：正确性由 `crypto-golden-test`
保证逐字节一致，只是慢。如果部署在 musl 且需要处理 chacha20 存量数据，改用 `tjs-glibc` 或转 aesctr。

## 6. WebDAV 方法支持

`tjs-build/patches/0002` + `0003` 扩展了 libwebsockets 的 H1 词表与方法数组，
`PROPFIND / MKCOL / COPY / MOVE / PROPPATCH / LOCK / UNLOCK` 均已可解析并透传。
未打这两个补丁的 tjs 会在解析层直接 403，WebDAV 写链路不可用。

## 7. 回归命令

```bash
cd node-proxy
node test/p2-tjs-smoke.mjs        # HTTP 接缝（三端各 21 项）
node test/p3-enc-smoke.mjs -- ../tjs-build/dist/tjs-glibc run --import-map tjs.importmap.json app.tjs.js
node test/p4-storage-smoke.mjs -- ../tjs-build/dist/tjs-glibc run --import-map tjs.importmap.json app.tjs.js
../tjs-build/dist/tjs-glibc run test/crypto-golden-test.mjs
```
