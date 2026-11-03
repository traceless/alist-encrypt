/**
 * tjs HTTP 服务入口（P2）—— `tjs run --import-map tjs.importmap.json app.js` 的 tjs 分支
 *
 * 接缝结构（2026-10-31 探测结论）：
 *   - tjs.serve({port, fetch}) 的 handler 收到标准 Web Request（流式 body 为 ReadableStream），
 *     返回 Response；流式 body 由 httpserver 逐 chunk 发送并自动剥 hop-by-hop 头（含 content-length）
 *   - handler 第二参 {server, remoteAddress, httpVersion} 作为 Hono c.env 的注入位：
 *     env.incoming/outgoing 为 node req/res 等价 shim（业务消费面：method/url 可变/headers 可变
 *     plain object/属性挂袋/socket.encrypted + statusCode/setHeader/getHeader/removeHeader/
 *     write(带背压)/end/on('close')）
 *   - RESPONSE_ALREADY_SENT（x-hono-already-sent 标记）：业务直接写 outgoing 后返回该标记，
 *     adapter 检测 header 后用 shim 状态构造最终 Response；其余响应直接透传 Hono 的 Response
 *   - 100-continue：tjs httpserver 层原生处理（S2 spike 已验证群晖场景 PASS）
 *   - maxConnections/getConnections：tjs 无等价物，省略
 *
 * 背压链：httpProxy 的后台泵 await outgoing.write（TransformStream writable 满则停），
 * 消费端由 tjs httpserver 读 _readable 驱动，避免大文件下载内存堆积。
 */
import { buildApp } from './appFactory.js'
import { port } from './config.js'
import { logger } from './common/logger.js'
import { cwd } from './runtime/isTjs.js'
import * as fsx from './runtime/fsx.js'
import { bufferShim } from './runtime/bufferx.js'
import path from 'path'

// 本模块被 app.js 静态 import（双端安全：顶层无 tjs 专属依赖，tjs.serve 仅在
// startupServer 内调用；tjs 下动态 import 依赖已加载 TLA 模块图的模块会挂起，已实测）。
// Buffer shim 注入必须在 startupServer 内：node 端不调用本函数，原生 Buffer 不受影响。

const K_ALREADY_SENT = 'x-hono-already-sent'
const textEncoder = new TextEncoder()

// 静态资源 MIME（hono 的 getMimeType 走 'hono/utils/mime' 子路径，import map 仅映射主入口，
// 这里按 public/ 现有资源类型最小覆盖）
const MIME = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=UTF-8',
}

// 对齐 @hono/node-server/serve-static({root}) 签名：返回 Hono middleware，文件缺失走 next()
function tjsServeStatic({ root }) {
  const rootAbs = path.resolve(cwd(), root)
  return async (c, next) => {
    let rel
    try {
      rel = decodeURIComponent(c.req.path).replace(/^\/+/, '')
    } catch {
      return await next()
    }
    const filePath = path.join(rootAbs, rel)
    // 防路径穿越（normalize 后必须仍在 root 下）
    if (!filePath.startsWith(rootAbs)) {
      return await next()
    }
    let data
    try {
      data = await fsx.readFile(filePath)
    } catch {
      return await next()
    }
    return c.body(data, 200, { 'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' })
  }
}

// node IncomingMessage 等价 shim：业务消费面 + 属性挂袋（urlAddr/webdavConfig/passwdInfo/...）
function makeIncoming(request, info) {
  const u = new URL(request.url)
  return {
    method: request.method,
    url: u.pathname + u.search,
    headers: Object.fromEntries(request.headers),
    // 请求体（Web ReadableStream）：httpProxy 透传直用；
    // request.pipe(transform)（加密上传）为 P3 插槽——P2 阶段加密路由触达前已先炸在 FlowEnc 构造
    body: request.body,
    socket: { encrypted: false, remoteAddress: info.remoteAddress },
    remoteAddress: info.remoteAddress,
  }
}

// node ServerResponse 等价 shim：写入即流入 TransformStream，adapter 据此构造流式 Response
function makeOutgoing() {
  const ts = new TransformStream()
  const writer = ts.writable.getWriter()
  const headers = new Map()
  const closeCbs = []
  let status = 200
  let ended = false

  const toBytes = (chunk) => (typeof chunk === 'string' ? textEncoder.encode(chunk) : chunk)
  const lowerKey = (k) => String(k).toLowerCase()

  return {
    get statusCode() {
      return status
    },
    set statusCode(v) {
      status = v
    },
    setHeader(k, v) {
      headers.set(lowerKey(k), String(v))
    },
    getHeader(k) {
      return headers.get(lowerKey(k))
    },
    removeHeader(k) {
      headers.delete(lowerKey(k))
    },
    // 返回 write promise 供泵侧 await（背压经 TransformStream 高水位传递）
    write(chunk) {
      if (chunk == null) return Promise.resolve()
      return writer.write(toBytes(chunk)).catch(() => {})
    },
    end(chunk) {
      if (ended) return
      ended = true
      if (chunk != null) this.write(chunk)
      writer.close().catch(() => {})
    },
    on(ev, cb) {
      if (ev === 'close') closeCbs.push(cb)
      return this
    },
    _emitClose() {
      for (const cb of [...closeCbs]) {
        try {
          cb()
        } catch {}
      }
    },
    get _headers() {
      return headers
    },
    get _readable() {
      return ts.readable
    },
  }
}

let app

// tjs.serve handler ≙ Hono app.fetch 挂载 + c.env 等价上下文
async function handle(request, info) {
  const env = { incoming: makeIncoming(request, info), outgoing: makeOutgoing() }
  let res
  try {
    res = await app.fetch(request, env)
  } catch (e) {
    logger.error('@@tjs-handle error', e)
    res = new Response('Internal Server Error', { status: 500 })
  }
  if (res.headers.get(K_ALREADY_SENT) === 'true') {
    // 业务直接写 outgoing（httpProxy/respondRaw/end），用 shim 状态构造最终响应
    const headers = new Headers()
    for (const [k, v] of env.outgoing._headers) headers.set(k, v)
    return new Response(env.outgoing._readable, { status: env.outgoing.statusCode, headers })
  }
  return res
}

export function startupServer() {
  // 最小 Buffer shim：透传/改写路径的 Buffer.byteLength 等基础用法，完整分发由 P3 替换
  globalThis.Buffer = bufferShim
  app = buildApp({ serveStatic: tjsServeStatic, staticRoot: cwd() })
  tjs.serve({ port, fetch: handle })
  logger.info('服务启动成功: ' + port)
}
