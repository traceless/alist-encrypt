/**
 * S2 tjs.serve 流式/Range/100-continue/Hono 验证（仅 txiki.js 运行）
 *
 * 用法：
 *   tjs bench/serve-spike.mjs selftest   # 起内部 server + fetch 自测（S2a/S2b/S2c/S2e），完成后退出
 *   tjs bench/serve-spike.mjs serve      # 长驻 server，供外部 curl 测 100-continue（S2d）/ Range / RSS
 *
 * RSS 观察（外部）：ps -o rss= -p $(pidof tjs)  下载/上传前后各取一次
 */
'use strict'

const PORT = 5399
const CHUNK = 64 * 1024

function zeroStream(totalBytes) {
  const block = new Uint8Array(CHUNK)
  let sent = 0
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close()
        return
      }
      const remain = totalBytes - sent
      controller.enqueue(remain >= CHUNK ? block : block.subarray(0, remain))
      sent += Math.min(CHUNK, remain)
    },
  })
}

// Range 场景：从 offset 开始产出 len 字节（模拟加密下载的 setPosition 定位语义）
function rangedStream(offset, len) {
  const block = new Uint8Array(CHUNK)
  let pos = offset
  let sent = 0
  return new ReadableStream({
    pull(controller) {
      if (sent >= len) {
        controller.close()
        return
      }
      controller.enqueue(block.subarray(0, Math.min(CHUNK, len - sent)))
      pos += CHUNK
      sent += Math.min(CHUNK, len - sent)
    },
  })
}

function parseRange(header) {
  const m = /^bytes=(\d+)-(\d*)$/.exec(header || '')
  if (!m) return null
  const start = parseInt(m[1], 10)
  const end = m[2] ? parseInt(m[2], 10) : null
  return { start, end }
}

function buildApp() {
  return {
    async fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/ping') {
        return new Response('ok')
      }
      if (url.pathname === '/stream') {
        const mb = Math.min(parseInt(url.searchParams.get('mb') || '256', 10), 4096)
        return new Response(zeroStream(mb * 1024 * 1024), {
          headers: { 'content-type': 'application/octet-stream' },
        })
      }
      if (url.pathname === '/upload' && request.method === 'PUT') {
        const reader = request.body.getReader()
        let bytes = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          bytes += value.byteLength
        }
        return Response.json({ bytes })
      }
      if (url.pathname === '/range') {
        const range = parseRange(request.headers.get('range'))
        if (!range) {
          return new Response('range required', { status: 416 })
        }
        const total = 1024 * 1024 * 1024
        const end = range.end === null ? total - 1 : Math.min(range.end, total - 1)
        const len = end - range.start + 1
        return new Response(rangedStream(range.start, len), {
          status: 206,
          headers: {
            'content-type': 'application/octet-stream',
            'content-range': `bytes ${range.start}-${end}/${total}`,
            'accept-ranges': 'bytes',
          },
        })
      }
      return new Response('not found', { status: 404 })
    },
  }
}

// ---------- S2e: Hono 挂载（node-proxy 现有依赖，验证框架核心在 tjs 可用） ----------
// 注意：tjs 对 node_modules 的 bare specifier（exports 字段）解析不完整，
// 需用相对路径导入 dist/index.js —— 迁移时由 runtime 适配层统一收敛。
async function honoSmoke() {
  const { Hono } = await import('../node_modules/hono/dist/index.js')
  const app = new Hono()
  app.use(async (c, next) => {
    c.set('ts', Date.now())
    await next()
  })
  app.get('/enc-api/ping', (c) => c.json({ flag: true, msg: 'pong', code: 200, data: null }))
  app.post('/enc-api/echo', async (c) => {
    const body = await c.req.json()
    return c.json({ code: 200, data: body })
  })
  app.get('/enc-api/param/:id', (c) => c.json({ code: 200, data: c.req.param('id') }))
  // fetch handler 直接调用（不经网络，验证 Hono 核心 + 中间件 + json 解析）
  const mk = (path, init) => new Request(`http://127.0.0.1${path}`, init)
  const r1 = await app.fetch(mk('/enc-api/ping'))
  const j1 = await r1.json()
  if (!r1.ok || j1.code !== 200) throw new Error('hono GET fail')
  const r2 = await app.fetch(mk('/enc-api/echo', { method: 'POST', body: JSON.stringify({ a: 1 }) }))
  const j2 = await r2.json()
  if (j2.data?.a !== 1) throw new Error('hono POST json fail')
  const r3 = await app.fetch(mk('/enc-api/param/xyz'))
  const j3 = await r3.json()
  if (j3.data !== 'xyz') throw new Error('hono param fail')
  return 'hono app.fetch 3/3 ok (middleware/json/param)'
}

async function selftest() {
  const results = []
  const server = tjs.serve({ port: PORT, fetch: buildApp().fetch })
  results.push(`S2e ${await honoSmoke()}`)
  const base = `http://127.0.0.1:${PORT}`

  // S2a 流式下载：512MB，读流计数（服务端零拷贝生成）
  {
    const t0 = performance.now()
    const resp = await fetch(`${base}/stream?mb=512`)
    const reader = resp.body.getReader()
    let bytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
    }
    const ms = performance.now() - t0
    if (bytes !== 512 * 1024 * 1024) throw new Error(`stream byte mismatch: ${bytes}`)
    results.push(`S2a stream-download 512MB: ${(512 / (ms / 1000) / 1.048576).toFixed(1)} MB/s (loopback+JS)` )
  }

  // S2b 流式上传：256MB 分块 PUT
  {
    const t0 = performance.now()
    const block = new Uint8Array(CHUNK)
    let sent = 0
    const total = 256 * 1024 * 1024
    const stream = new ReadableStream({
      pull(controller) {
        if (sent >= total) {
          controller.close()
          return
        }
        controller.enqueue(block)
        sent += CHUNK
      },
    })
    const resp = await fetch(`${base}/upload`, { method: 'PUT', body: stream, duplex: 'half' })
    const j = await resp.json()
    if (j.bytes !== total) throw new Error(`upload byte mismatch: ${j.bytes}`)
    const ms = performance.now() - t0
    results.push(`S2b stream-upload 256MB: ${(256 / (ms / 1000) / 1.048576).toFixed(1)} MB/s`)
  }

  // S2c Range
  {
    const resp = await fetch(`${base}/range`, { headers: { range: 'bytes=1000-1999' } })
    const buf = new Uint8Array(await resp.arrayBuffer())
    const cr = resp.headers.get('content-range')
    if (resp.status !== 206 || buf.length !== 1000 || cr !== `bytes 1000-1999/${1024 * 1024 * 1024}`) {
      throw new Error(`range fail: status=${resp.status} len=${buf.length} cr=${cr}`)
    }
    results.push('S2c range: 206 + content-range ok')
  }

  console.log(results.join('\n'))
  console.log('=== SELFTEST PASS ===')
  await server.close()
}

async function serveMode() {
  const server = tjs.serve({ port: PORT, fetch: buildApp().fetch })
  console.log(`SPIKE_SERVER_READY port=${server.port} pid=${typeof process !== 'undefined' ? process.pid : 'see-ps'}`)
}

// tjs.run 下 tjs.args = [tjs路径, run, 脚本名, 模式...]；node 下 process.argv = [node, 脚本, 模式...]
const rawArgs = typeof tjs !== 'undefined' ? tjs.args : process.argv
const mode = rawArgs[rawArgs.length - 1] === 'serve' ? 'serve' : 'selftest'
if (mode === 'selftest') await selftest()
else await serveMode()
