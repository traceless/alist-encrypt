# alist-encrypt

为 [AList](https://github.com/AlistGo/alist)（以及 OpenList 等兼容分支）提供网页与 WebDAV 透明加解密的代理服务。

[English](README_EN.md) | 简体中文

alist-encrypt 部署在 AList 前面：上传时加密，下载、预览和在线播放时解密。因为采用流式加密并支持 Range 定位，加密后的视频可以直接在网页中拖动进度条播放，图片和文本也可以在线查看，不需要先下载完整文件。除加密上传/解密播放外，AList 原有的网页操作与 WebDAV 请求都会透明透传。

> 项目仍在持续开发中。主运行时为 Node.js，`txiki` 分支提供 txiki.js 双运行时实验支持。当前版本见 [config.js](node-proxy/src/config.js)（0.3.0）。

## 功能特性

| 能力 | 说明 |
|---|---|
| AList 网页透明代理 | 页面、登录、API、图标等请求透传，仅在需要时改写 |
| WebDAV 透明加解密 | WebDAV 客户端上传自动加密、下载自动解密，可挂载到 Infuse、VLC、IINA、rclone 等 |
| 在线播放与预览 | 支持 Range 请求和 302 跳转，加密视频/图片/文本可直接在线访问 |
| 多加密算法 | AES-CTR（默认，推荐）、ChaCha20、RC4（兼容旧数据，已不推荐） |
| 多密码组 | 不同目录使用不同密码和算法，目录通过正则表达式匹配 |
| 文件名/目录名加密 | 可分别开启，列表中自动解密显示，写操作自动加密 |
| 子密码（密码替身） | 把子目录密码和算法编码进文件夹名，访问该目录时自动切换密码，便于分享 |
| Web 管理界面 | 概览、AList 配置、WebDAV 配置、云端加密、在线解密 |
| 服务端批量加解密 | 对代理所在机器的目录异步批量加密/解密，单次上限 10000 个文件 |
| 浏览器本地加解密 | 文件不上传，浏览器内流式加解密，可解密并生成分卷 zip |
| CLI | 命令行批量加密/解密，适合本地处理后再上传 |
| 双运行时 | Node.js（主）与 txiki.js（实验，单文件二进制） |
| 多架构镜像 | CI 构建 amd64 / arm64 / armv7 Docker 镜像 |

## 工作原理

```text
浏览器 / WebDAV 客户端
        │
        ▼
  alist-encrypt:5344          ← 命中加密路径时做流式加解密
        │
        ▼
     AList:5244               ← 网页、API、WebDAV、302 跳转
        │
        ▼
   网盘 / 存储后端
```

几个关键设计：

- **按路径启用加密**：配置中的 `encPath` 是正则表达式，请求路径命中后才进入加解密流程，其余请求原样透传。
- **流式处理**：加密/解密以流的方式完成，不落盘、不整文件读入内存，因此大文件也不会占满内存。
- **文件密钥与文件大小绑定**：密钥由「密码 + 文件大小」派生（`sizeSalt`），解密时必须拿到原始文件大小。代理从 AList 元数据或本地 KV 缓存中获取该值。
- **Range 定位**：播放器请求 `bytes=xxx-` 时，代理按偏移重建加密计数器，只解密所需片段。
- **文件名加密**：文件名经流密码加密后再编码，附带校验信息；列表接口将密文名解密为明文展示，上传、重命名、移动等写操作反向加密。
- **302 跳转**：网盘返回 302 时由代理接管，跟随真实地址并流式解密，因此网盘的直链跳转不会绕过加解密。
- **本地缓存**：文件信息缓存在 `conf/nedb/datafile.db`（基于 `node:sqlite` 的 KV，旧 nedb 数据会自动迁移），用于记录路径、大小等解密参数。

## 快速开始（Node.js）

环境要求：Node.js 20 及以上（推荐 22），npm。

```bash
git clone https://github.com/traceless/alist-encrypt.git
cd alist-encrypt/node-proxy

# 只运行、不安装开发依赖
npm install --omit=dev

# 启动服务
npm run serve
```

首次启动时如果 `conf/config.json` 不存在，会自动生成默认配置。可以在启动前用环境变量指定 AList 地址（仅首次生成配置时生效）：

```bash
ALIST_HOST=192.168.1.100:5244 npm run serve
```

也可以直接编辑 [conf/config.json](node-proxy/conf/config.json) 或使用管理页面。

启动后：

- 管理页面：<http://127.0.0.1:5344/public/index.html>，默认账号 `admin`，默认密码 `123456`（登录后请修改，后端要求新密码至少 8 位）。
- 代理后的 AList：<http://127.0.0.1:5344/>
- 也可以在 AList 页面地址后直接访问 `/index`，会跳转到管理页面。

注意事项：

- 必须在 `node-proxy` 目录下启动，`conf/`、`logs/`、`public/` 都按当前工作目录解析。
- 默认端口 `5344`，可在 `conf/config.json` 的 `port` 字段修改。
- 修改 `ALIST_HOST` 后如果配置已存在，不会覆盖现有配置，请在管理页面或配置文件中修改。

开发模式：

```bash
npm run dev     # node --watch app.js
npm run ui      # 单独调试前端页面（Vite）
```

## Docker 部署

CI 构建的镜像支持 `linux/amd64`、`linux/arm64`、`linux/arm/v7`，标签为 `latest` 和日期标签。

```bash
docker run -d \
  --name alist-encrypt \
  --restart unless-stopped \
  -p 5344:5344 \
  -v "$(pwd)/alist-encrypt-conf:/node-proxy/conf" \
  -e TZ=Asia/Shanghai \
  -e ALIST_HOST=192.168.1.100:5244 \
  prophet310/alist-encrypt:latest
```

`docker-compose.yml`：

```yaml
services:
  alist-encrypt:
    image: prophet310/alist-encrypt:latest
    container_name: alist-encrypt
    restart: unless-stopped
    ports:
      - "5344:5344"
    volumes:
      - ./alist-encrypt-conf:/node-proxy/conf
    environment:
      TZ: Asia/Shanghai
      ALIST_HOST: 192.168.1.100:5244
```

`conf/` 必须持久化，否则重启后配置、用户密码和缓存都会丢失。

自行构建镜像：

```bash
cd node-proxy
npm install
npm run docker       # 构建 beta 标签
npm run docker-arm   # 构建 ARM 标签
```

> 构建脚本内使用 `sudo docker`，如当前用户已有 Docker 权限可自行调整。

## 配置说明

`conf/config.json` 结构（首次启动自动生成）：

```json
{
  "alistServer": {
    "name": "alist",
    "path": "/*",
    "serverHost": "192.168.1.100",
    "serverPort": 5244,
    "https": false,
    "passwdList": [
      {
        "password": "123456",
        "encType": "aesctr",
        "enable": true,
        "encName": false,
        "encFolder": false,
        "describe": "my video",
        "encPath": ["movie_encrypt/*", "encrypt_folder/*"]
      }
    ]
  },
  "webdavServer": [],
  "port": 5344
}
```

`alistServer`：

| 字段 | 说明 |
|---|---|
| `serverHost` / `serverPort` / `https` | AList 的地址、端口和协议 |
| `path` | AList 代理入口路径，默认 `/*`，一般不需要改 |
| `passwdList` | 密码组列表，可配置多组不同目录、不同密码 |

密码组字段：

| 字段 | 说明 |
|---|---|
| `enable` | 是否启用该密码组 |
| `password` | 加密密码 |
| `encType` | `aesctr`（默认）、`chacha20`、`rc4`（兼容旧数据） |
| `encPath` | 需要加密的路径正则数组，也支持在页面中逗号分隔填写 |
| `encName` | 是否加密文件名（保留原扩展名） |
| `encFolder` | 是否加密目录名 |
| `describe` | 备注 |
| `encSuffix` | 可选，自定义扩展名处理，一般留空 |

`encPath` 示例：

- `movie_encrypt/.*`：匹配 URL 中包含 `movie_encrypt/` 的路径。
- `^/onedrive/encrypt/.*`：只匹配以 `/onedrive/encrypt/` 开头的路径。
- 正则越宽松，命中的文件越多，建议先用小目录验证。

WebDAV 配置字段：

| 字段 | 说明 |
|---|---|
| `name` | 配置名称 |
| `path` | 代理主路径正则，例如 `^/aliyun-dav/.*`，不能是 `/enc-api/*` |
| `serverHost` / `serverPort` / `https` | 上游 WebDAV 地址 |
| `enable` | 是否启用 |
| `passwdList` | 与 AList 密码组字段相同 |

> WebDAV 主路径修改后需要重启服务生效；密码组修改保存后生效。

环境变量：

| 变量 | 说明 |
|---|---|
| `ALIST_HOST` | `host:port`，仅在首次生成 `conf/config.json` 时作为 AList 地址 |
| `RUN_MODE` | 设为 `DEV` 输出 debug 日志 |
| `TJS_CA_BUNDLE` / `SSL_CERT_FILE` | txiki.js 运行时的上游 CA bundle，见下文 |

运行数据：

- `conf/config.json`：配置。
- `conf/nedb/datafile.db`：文件信息与登录 token 的 KV 缓存。
- `logs/server.log`：运行日志。

## 使用说明

### AList 配置

在「Alist 配置」页面填写 AList 地址、端口、协议，然后添加密码组。保存后会立即生效并写入 `conf/config.json`。

配置了加密路径后，该目录下的文件通过代理上传会被加密，通过代理下载、播放、预览会自动解密。直接访问网盘后端看到的是密文。

加密路径同时会自动暴露 `/d/...`、`/p/...`、`/dav/...` 前缀，用于兼容 AList 的下载、预览和 WebDAV 地址。

### WebDAV 配置

在「WebDAV 配置」页面新增服务：

1. 填写服务名称、上游主机、端口、是否 HTTPS。
2. 填写主路径正则，例如 `^/aliyun-dav/.*`。
3. 添加密码组，指定子路径（`encPath`）和密码。
4. 保存后重启服务。

客户端连接 `http://代理地址:5344/<主路径前缀>`，使用上游 WebDAV 的账号密码。主路径是正则前缀，代理会把它透传给上游，因此 WebDAV 客户端中看到的目录结构与上游一致。

支持的 WebDAV 方法：`PROPFIND`、`PROPPATCH`、`MKCOL`、`GET`、`PUT`、`DELETE`、`COPY`、`MOVE`、`LOCK`、`UNLOCK`。Node 运行时原生支持；txiki.js 运行时需要应用 `tjs-build/patches/` 中的 WebDAV 补丁（见下文）。

### 在线播放与下载

AList 网页中直接点击播放/预览即可，代理会自动处理：

- 视频 Range 请求：按偏移解密，支持拖动进度条。
- 图片、文本：在线解密后返回。
- 下载、外部播放器跳转：保持 AList 原有入口，实际请求仍走代理。

网盘返回 302 时不需要额外配置，代理会跟随真实地址并保持解密。

### 云端加密（服务端批量）

「云端加密」页面对**代理所在服务器上的本地目录**做批量加解密，适合先把文件处理好再上传，或把已加密文件批量还原。

- 任务异步执行，提交后可以继续使用服务。
- 单次最多扫描 10000 个文件。
- 输出路径留空时写入 `outFile/<时间戳>`。
- 大文件更推荐在本地或浏览器中处理后再上传，避免代理长时间占用带宽和 CPU。

该功能不是网盘转存；「文件转存到加密目录」仍在规划中。

### 在线解密（浏览器本地）

「在线解密」页面在浏览器内完成加解密，文件不会上传到服务器：

- 文件加密/解密：支持 AES-CTR、ChaCha20，可选处理块大小。
- 文件名加密：可整体加密为密文名并追加 `.enc`，解密时还原。
- 解密转分卷：逐块解密并按指定单卷大小生成 `.z01`、`.z02`… 和 `.zip`，适合 iOS 等不支持流式写入大文件的场景；用 7-Zip / WinRAR 打开最后一个 `.zip` 即可合并解压。

密文格式与后端、CLI 一致，三处可以互通。

### 子密码 / 文件夹名派生

在密码组卡片中点击「子密码/文件夹名」，可以把「子算法 + 子密码」用当前密码加密成一个文件夹密文名：

1. 填写备注、子目录算法和子目录密码，生成密文名。
2. 用该密文名命名子文件夹。
3. 访问该文件夹下的内容时，代理识别文件夹名并自动切换为该子密码和算法。

这样分享时只需要给出文件夹密文名，对方不需要知道原始密码；同时不同子目录可以使用不同密码。

### CLI 批量加解密

```bash
cd node-proxy
node app.js <password> <encType> <enc|dec> <folder> <outPath> [encName]
```

示例：

```bash
node app.js mypassword aesctr enc ./videos ./out encName
node app.js mypassword aesctr dec ./out ./plain
```

- `encType`：`aesctr`、`chacha20`、`rc4`。
- `enc` / `dec`：加密或解密。
- `outPath`：输出目录，留空时使用 `outFile/<时间戳>`。
- `encName`：传入任意非空字符串即启用文件名加密/解密。
- 加密后默认写入临时目录再原子重命名，避免中断产生半成品。

说明：CLI 依赖 Node.js 的文件流，txiki.js 入口不支持，传入额外参数时会直接报错退出。

## 加密算法

| encType | 密钥派生 | 定位播放 | 状态 | 说明 |
|---|---|---|---|---|
| `aesctr` | PBKDF2 + 文件大小 | 支持 | 默认，推荐 | 速度快，适合大多数 CPU，视频播放首选 |
| `chacha20` | PBKDF2 + 文件大小 | 支持 | 可用 | 纯 JS 实现；txiki.js 下可走 FFI 加速 |
| `rc4` | PBKDF2 + 文件大小 | 支持 | 兼容旧数据 | 新配置不建议使用，管理页面标注为已废弃 |

性能参考（同一台机器实测，实际取决于 CPU 和运行时）：

| 场景 | 算法 | 吞吐 |
|---|---|---|
| Node.js | AES-CTR | 约 235 MB/s |
| txiki.js glibc | AES-CTR | 约 193 MB/s |
| txiki.js glibc | ChaCha20（FFI） | 约 1.3 GB/s |
| txiki.js musl | ChaCha20（纯 JS 降级） | 约 1 MB/s |

选择建议：

- 默认选 `aesctr`，绝大多数设备都支持 AES 指令，播放定位稳定。
- 需要更高吞吐且使用 txiki.js glibc 时可选 `chacha20`。
- 已有 `rc4` 数据继续使用 `rc4` 解密；新数据不要再用。

互通规则：

- 同一份密文必须使用**相同算法 + 相同密码**才能解密；算法或密码变更后旧数据无法还原。
- 解密还依赖原始文件大小（`sizeSalt`），因此不要在上游直接替换成不同大小的文件。
- 浏览器在线解密、服务端批量加解密、CLI 三者的密文格式一致。

安全说明：

- 这些算法是流密码，只提供机密性，**不提供完整性校验或身份认证**；能修改密文的一方可以篡改明文。
- 密钥和初始向量由「密码 + 文件大小」派生，相同密码且大小相同的文件会复用同一密钥流，这是流密码的已知风险。不要把该方案当作高价值数据的强加密，建议按目录使用不同密码，并妥善保管密码。
- 密码强度直接决定安全性，管理后台密码与加密密码请分开设置。

## txiki.js 运行时（可选）

`txiki` 分支在 Node.js 之外提供 txiki.js 运行时，目标是单文件二进制、低资源占用。详细说明见 [docs/tjs-runtime.md](docs/tjs-runtime.md)。

构建：

```bash
cd tjs-build
./build-tjs.sh
```

产物：

- `tjs-build/dist/tjs-glibc`：动态链接 glibc，ChaCha20 走 FFI（libcrypto / nettle），推荐。
- `tjs-build/dist/tjs-musl`：全静态单文件，ChaCha20 只能走纯 JS，速度较慢。

启动（必须在 `node-proxy` 目录下）：

```bash
cd node-proxy
../tjs-build/dist/tjs-glibc run --import-map tjs.importmap.json app.tjs.js
```

限制：

- CLI 批量加解密不可用，请使用 Node.js 运行时。
- musl 版不支持 `dlopen`，ChaCha20 会降级为纯 JS；如要处理 ChaCha20 存量数据，使用 glibc 版或转成 AES-CTR。
- 自签 HTTPS 上游需要提供 CA bundle，且是**替换**内置 bundle：`--tls-ca <file>` > `TJS_CA_BUNDLE` > `SSL_CERT_FILE` > 内置 bundle。
- WebDAV 的 `PROPFIND`、`MKCOL`、`COPY`、`MOVE`、`PROPPATCH`、`LOCK`、`UNLOCK` 依赖 `tjs-build/patches/` 中的补丁；未打补丁的 txiki.js 会在解析层拒绝这些方法。

Node.js 运行时对自签 HTTPS 上游采用放开校验的方式（与原实现一致），会打印一次警告。

## 开发与测试

```bash
cd node-proxy

npm run dev       # 开发模式，文件变更自动重启
npm run serve     # 生产启动
npm run bundle    # esbuild 打包到 dist/
npm run build     # bundle + pkg 生成可执行文件到 build/
npm run ui        # Vite 调试前端
```

测试（部分脚本会临时改写 `conf/config.json` 并占用 5344/5244 端口，运行前请停止正在运行的服务）：

```bash
node test/crypto-golden-test.mjs          # 双运行时密文金样
node test/propfindParserTest.js           # WebDAV XML 解析
node test/runtime-test.mjs                # 运行时适配层
node test/p2-tjs-smoke.mjs                # HTTP 接缝冒烟（可驱动 node / tjs）
node test/p3-enc-smoke.mjs                # 加密链路端到端冒烟
node test/p4-storage-smoke.mjs            # 存储/配置/日志跨进程冒烟
node test/webdavSmokeTest.js              # 需要真实代理与上游
```

驱动 txiki.js 测试示例：

```bash
node test/p3-enc-smoke.mjs -- ../tjs-build/dist/tjs-glibc run --import-map tjs.importmap.json app.tjs.js
```

冒烟脚本不会自动杀掉被测服务，PID 会写入 `/tmp/*-smoke-service.pid`，测试结束后自行清理。

## 目录结构

```text
alist-encrypt/
├── node-proxy/            # 主服务
│   ├── app.js             # Node.js 入口（服务 + CLI）
│   ├── app.tjs.js         # txiki.js 入口
│   ├── src/               # 代理、加密、路由、DAO、运行时适配
│   ├── public/            # Web 管理界面
│   ├── conf/              # 首次启动生成配置与数据
│   └── test/              # 金样测试、冒烟测试
├── tjs-build/             # txiki.js 构建脚本、补丁、产物
├── docs/                  # 迁移记录与运行时文档
├── .github/workflows/     # 构建、发布、Docker 镜像
└── dockerfile             # Docker 镜像构建文件
```

运行时依赖只有 `hono` 和 `@hono/node-server`，其余逻辑基于 Node.js 内置模块。

## 常见问题

**播放卡顿或速度慢？**

代理会占用部署机器的带宽和 CPU，建议把 alist-encrypt 部署在离存储较近、带宽充足的设备上。低性能设备优先使用 AES-CTR。

**下载后乱码或解密失败？**

依次检查：

1. 算法和密码是否与上传时一致。
2. 文件大小是否被改变（例如在上游直接覆盖了文件）。密钥依赖原始大小。
3. 同一路径是否被不同大小的文件覆盖过，导致缓存中的旧大小参与解密。可以重新列一次父目录刷新缓存。
4. 大文件播放时是否使用了不支持的客户端；可先用浏览器或 WebDAV 验证。

**AList 或 WebDAV 配置改了不生效？**

AList 配置保存后立即生效；WebDAV 主路径需要重启服务。

**上游是自签 HTTPS 证书？**

Node.js 运行时会放开证书校验（会打印警告）；txiki.js 运行时需要按上文配置 CA bundle。

**能否直接把网盘里已有的文件转存到加密目录？**

暂未实现，当前只支持代理上传时加密、服务端本地批量加解密、浏览器本地加解密。大文件建议先本地加密再上传。

## 路线图

- 网盘文件转存到加密目录（规划中）。
- 继续完善 txiki.js 运行时与跨平台打包。
- 持续适配 AList / OpenList 的接口变化。

## 社区与许可

- 问题反馈：GitHub Issues <https://github.com/traceless/alist-encrypt/issues>
- 讨论群：422035582
- License：ISC（见 `package.json`）
