/**
 * P2 HTTP 接缝冒烟（node 编写，可驱动任意被测运行时）
 *
 * 结构：
 *   1. 备份并改写 conf/config.json（上游指向本脚本 mock，全部加密 passwd 关闭 → 纯透传路径）
 *   2. 启动 mock 上游（alist:5244 / webdav:5245）
 *   3. spawn 被测服务（node / tjs-glibc / tjs-musl，等 5344 就绪）
 *   4. 断言：管理面 / 静态资源 / alist 接口转换 / alist 兜底注入 / webdav 全方法透传 / 大文件流完整
 *   5. finally 还原配置，退出码 0/1
 *
 * 用法（cwd=node-proxy）：
 *   node test/p2-tjs-smoke.mjs                          # 被测 = node app.js
 *   node test/p2-tjs-smoke.mjs --verbose -- <command>   # 被测 = 自定义命令（--verbose 须在 -- 前）
 *   例：node test/p2-tjs-smoke.mjs -- ../tjs-build/dist/tjs-glibc run --import-map tjs.importmap.json app.tjs.js
 *
 * 注意：脚本不负责杀被测服务（在部分沙箱环境下，父进程 kill 运行中的子进程会导致执行器崩溃），
 * 被测服务 PID 写入 /tmp/p2-smoke-service.pid，由调用方清理：
 *   node test/p2-tjs-smoke.mjs ...; kill $(cat /tmp/p2-smoke-service.pid)
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'

const PROXY_PORT = 5344
const ALIST_PORT = 5244
const WEBDAV_PORT = 5245
const BASE = `http://127.0.0.1:${PROXY_PORT}`
const CONFIG_PATH = 'conf/config.json'
const CONFIG_BACKUP = '/tmp/p2-config-backup.json'

// ============================== 断言 runner ==============================
let passCount = 0
const failures = []
const skips = []
function ok(cond, name, extra = '') {
  if (cond) {
    passCount++
    console.log(`  PASS ${name}`)
  } else {
    failures.push(name + (extra ? ` | ${extra}` : ''))
    console.log(`  FAIL ${name} ${extra}`)
  }
}
function skip(name, reason) {
  skips.push(name)
  console.log(`  SKIP ${name} —— ${reason}`)
}

// ============================== mock 上游 ==============================
// mock 收到的请求记录（断言上游视角的透传结果）
const mockLog = { alistBodies: {}, webdavPutBody: null, davMethods: [] }

const BIG_SIZE = 2 * 1024 * 1024
const bigPayload = Buffer.alloc(BIG_SIZE)
for (let i = 0; i < BIG_SIZE; i++) bigPayload[i] = i % 251

function startMock(port, handler) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler)
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

const alistMock = await startMock(ALIST_PORT, (req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    if (req.method === 'POST' && req.url === '/api/fs/list') {
      mockLog.alistBodies.list = JSON.parse(body.toString())
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          code: 200,
          message: 'success',
          data: {
            content: [
              { name: 'movie.mp4', size: 1024, is_dir: false, type: 2 },
              { name: 'sub', size: 0, is_dir: true, type: 1 },
            ],
            total: 2,
          },
        })
      )
      return
    }
    if (req.method === 'POST' && req.url === '/api/fs/get') {
      mockLog.alistBodies.get = JSON.parse(body.toString())
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          code: 200,
          message: 'success',
          data: { name: 'movie.mp4', raw_url: 'http://mock/raw/movie.mp4', size: 1024, is_dir: false, provider: 'Local' },
        })
      )
      return
    }
    if (req.method === 'GET' && req.url === '/p/movie.mp4') {
      res.end('P-BODY-movie')
      return
    }
    if (req.method === 'GET' && req.url === '/') {
      res.setHeader('content-type', 'text/html')
      res.end('<html><head></head><body>alist-root</body></html>')
      return
    }
    res.statusCode = 404
    res.end('alist mock not found: ' + req.url)
  })
})

const webdavMock = await startMock(WEBDAV_PORT, (req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    if (['PROPFIND', 'MKCOL', 'COPY', 'MOVE', 'PROPPATCH', 'LOCK', 'UNLOCK'].includes(req.method)) {
      mockLog.davMethods.push(req.method)
      if (req.method === 'PROPFIND') {
        // enable=false 纯透传：不解析、不改写，断言状态码与 XML 原样透传
        res.setHeader('content-type', 'application/xml')
        res.statusCode = 207
        res.end(
          '<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:"><D:response><D:href>/aliyun-dav/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response></D:multistatus>'
        )
        return
      }
      res.statusCode = 200
      res.end('DAV-' + req.method)
      return
    }
    if (req.method === 'GET' && req.url === '/aliyun-dav/plain.txt') {
      res.end('WEBDAV-PLAIN-CONTENT')
      return
    }
    if (req.method === 'GET' && req.url === '/aliyun-dav/big.bin') {
      res.setHeader('content-length', BIG_SIZE)
      res.end(bigPayload)
      return
    }
    if (req.method === 'PUT' && req.url === '/aliyun-dav/upload.txt') {
      mockLog.webdavPutBody = body
      res.statusCode = 201
      res.end('created')
      return
    }
    res.statusCode = 404
    res.end('webdav mock not found: ' + req.url)
  })
})

// ============================== 配置改写 ==============================
const originalConfig = readFileSync(CONFIG_PATH, 'utf8')
function writeSmokeConfig() {
  const config = JSON.parse(originalConfig)
  // 上游全部指向本脚本 mock
  config.alistServer.serverHost = '127.0.0.1'
  config.alistServer.serverPort = String(ALIST_PORT)
  for (const p of config.alistServer.passwdList) p.enable = false
  const dav = config.webdavServer.find((w) => /aliyun-dav/.test(w.path)) || config.webdavServer[0]
  dav.serverHost = '127.0.0.1'
  dav.serverPort = String(WEBDAV_PORT)
  dav.enable = true
  for (const p of dav.passwdList) p.enable = false
  config.port = PROXY_PORT
  writeFileSync(CONFIG_PATH, JSON.stringify(config, '', '\t'))
}

// ============================== 被测服务 ==============================
function waitForProxy(timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const res = await fetch(`${BASE}/enc-api/getWebdavConfig`)
        resolve(res)
      } catch {
        if (Date.now() > deadline) return reject(new Error('被测服务启动超时'))
        setTimeout(poll, 300)
      }
    }
    poll()
  })
}

const argv = process.argv.slice(2)
const verbose = argv.includes('--verbose')
const sep = argv.indexOf('--')
const cmdArgs = sep === -1 ? null : argv.slice(sep + 1)
const [cmd, ...rest] = cmdArgs || [process.execPath, 'app.js']

writeSmokeConfig()
writeFileSync(CONFIG_BACKUP, originalConfig)

const serviceLogs = []
console.log(`被测命令: ${cmd} ${rest.join(' ')}`)
const child = spawn(cmd, rest, { stdio: ['ignore', 'pipe', 'pipe'] })
const collect = (buf) => {
  const text = buf.toString()
  serviceLogs.push(text)
  if (verbose) process.stdout.write(text)
}
child.stdout.on('data', collect)
child.stderr.on('data', collect)

let exitCode = 0
try {
  await waitForProxy()
  console.log('--- 管理面与静态资源 ---')

  // A1 管理接口可达
  const a1 = await fetch(`${BASE}/enc-api/getWebdavConfig`)
  ok(a1.status === 200, 'A1 /enc-api/getWebdavConfig 200', `got ${a1.status}`)

  // A2 静态资源（node=@hono/node-server serve-static / tjs=tjsServeStatic）
  const a2 = await fetch(`${BASE}/public/logo.png`)
  const a2buf = Buffer.from(await a2.arrayBuffer())
  ok(
    a2.status === 200 && a2buf[0] === 0x89 && a2buf[1] === 0x50,
    'A2 /public/logo.png PNG',
    `status=${a2.status} head=${a2buf.subarray(0, 4).toString('hex')}`
  )

  // A3 短地址重定向
  const a3 = await fetch(`${BASE}/index`, { redirect: 'manual' })
  ok(
    a3.status === 302 && (a3.headers.get('location') || '').includes('/public/index.html'),
    'A3 /index 302',
    `status=${a3.status} loc=${a3.headers.get('location')}`
  )

  console.log('--- alist 接口转换（encNameRouter，enable=false 无加密链路）---')

  // B1 fs/list：mock 返回结构 + 本侧补 path/showPath 字段
  const b1 = await fetch(`${BASE}/api/fs/list`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: '/', password: '', page: 1, per_page: 10, refresh: false }),
  })
  const b1json = await b1.json()
  ok(
    b1.status === 200 && b1json.data?.content?.[0]?.name === 'movie.mp4',
    'B1 /api/fs/list 透传返回',
    `status=${b1.status} body=${JSON.stringify(b1json).slice(0, 120)}`
  )
  ok(
    b1json.data?.content?.[0]?.showPath === '//movie.mp4' && b1json.data?.content?.[0]?.path === '//movie.mp4',
    // foldPath='/' 拼接产生的双斜杠为 node 原版既有行为，双端须一致
    'B1 list 补齐 showPath/path',
    JSON.stringify(b1json.data?.content?.[0])
  )
  ok(mockLog.alistBodies.list?.path === '/', 'B1 上游收到原始 foldPath', JSON.stringify(mockLog.alistBodies.list))

  // B2 fs/get：enable=false 原样透传（无 302 改写）
  const b2 = await fetch(`${BASE}/api/fs/get`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: '/movie.mp4', password: '' }),
  })
  const b2json = await b2.json()
  ok(
    b2.status === 200 && b2json.data?.raw_url === 'http://mock/raw/movie.mp4',
    'B2 /api/fs/get 原样透传',
    `status=${b2.status} body=${JSON.stringify(b2json).slice(0, 120)}`
  )

  // B3 /p/ 下载透传（handleDownload，passwdInfo undefined → httpProxy）
  const b3 = await fetch(`${BASE}/p/movie.mp4`)
  const b3text = await b3.text()
  ok(b3.status === 200 && b3text === 'P-BODY-movie', 'B3 /p/movie.mp4 下载透传', `status=${b3.status} body=${b3text}`)

  console.log('--- alist 兜底 HTML 注入 ---')

  // B4 兜底：HTML 注入角标 + content-length 重算
  const b4 = await fetch(`${BASE}/`)
  const b4text = await b4.text()
  const b4len = (await fetch(`${BASE}/`)).headers.get('content-length')
  ok(
    b4.status === 200 && b4text.includes('/public/logo.png') && b4text.includes('V.0.3.0') && b4text.includes('alist-root'),
    'B4 兜底 HTML 注入 logo/版本',
    `status=${b4.status} len=${b4text.length}`
  )
  if (/tjs/.test(cmd)) {
    // tjs httpserver 对流式 Response 统一 chunked 并剥 content-length（HTTP/1.1 合法，body 完整性
    // 由上一条断言保证）；node 保持显式 CL 头。已知差异，非缺陷。
    ok(b4len === null, 'B4 tjs 流式响应剥 CL（chunked 已知差异）', `cl=${b4len}`)
  } else {
    ok(Number(b4len) === Buffer.byteLength(b4text), 'B4 content-length 重算正确', `cl=${b4len} actual=${Buffer.byteLength(b4text)}`)
  }

  console.log('--- webdav 透传（enable=false 全分支跳过 → proxyHandle）---')

  // C1 PROPFIND 207 + XML 原样透传
  // tjs-build P2.5 补丁后 lws lextable 已扩展 PROPFIND/MKCOL/COPY/MOVE/PROPPATCH/LOCK/UNLOCK，
  // 解析层不再 403，node/tjs 两端行为应一致
  const c1 = await fetch(`${BASE}/aliyun-dav/`, { method: 'PROPFIND', headers: { depth: '1' } })
  const c1text = await c1.text()
  ok(
    c1.status === 207 && c1text.includes('<D:multistatus') && c1text.includes('/aliyun-dav/'),
    'C1 PROPFIND 207 XML 透传',
    `status=${c1.status} body=${c1text.slice(0, 80)}`
  )

  // C1b WebDAV 扩展方法逐个解析层接受 + 透传到上游
  for (const m of ['MKCOL', 'COPY', 'MOVE', 'PROPPATCH', 'LOCK', 'UNLOCK']) {
    // COPY/MOVE 按规范必须携带 Destination（应用层会解析该头，缺失会报 Invalid URL）
    const headers = /COPY|MOVE/.test(m) ? { destination: 'http://127.0.0.1:5245/aliyun-dav/y' } : {}
    const r = await fetch(`${BASE}/aliyun-dav/x`, { method: m, headers })
    const text = await r.text()
    ok(r.status === 200 && text === `DAV-${m}`, `C1 ${m} 解析层接受并透传`, `status=${r.status} body=${text.slice(0, 40)}`)
  }
  ok(
    ['PROPFIND', 'MKCOL', 'COPY', 'MOVE', 'PROPPATCH', 'LOCK', 'UNLOCK'].every((m) => mockLog.davMethods.includes(m)),
    'C1c 上游收到全部 7 种 WebDAV 方法',
    `seen=${mockLog.davMethods.join(',')}`
  )

  // C2 GET 文件透传
  const c2 = await fetch(`${BASE}/aliyun-dav/plain.txt`)
  const c2text = await c2.text()
  ok(c2.status === 200 && c2text === 'WEBDAV-PLAIN-CONTENT', 'C2 GET 透传', `status=${c2.status} body=${c2text}`)

  // C3 PUT 上传透传（请求体经 incoming shim → fetch 流式 → mock 收到原文）
  const putBody = 'PUT-PAYLOAD-123-中文'
  const c3 = await fetch(`${BASE}/aliyun-dav/upload.txt`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    body: putBody,
  })
  ok(
    c3.status === 201 && mockLog.webdavPutBody?.toString() === putBody,
    'C3 PUT 上传透传',
    `status=${c3.status} upstream=${mockLog.webdavPutBody?.toString()}`
  )

  // C4 大文件流完整性（pumpToResponse/pipe 背压与分块）
  const c4 = await fetch(`${BASE}/aliyun-dav/big.bin`)
  const c4buf = Buffer.from(await c4.arrayBuffer())
  ok(c4.status === 200 && c4buf.length === BIG_SIZE && c4buf.equals(bigPayload), 'C4 2MB 大文件流完整', `len=${c4buf.length}`)
} catch (e) {
  failures.push('EXCEPTION: ' + e.message)
  console.error('冒烟异常:', e)
  exitCode = 1
} finally {
  // 不杀被测服务：写 PID 交调用方清理（父进程 kill 运行中子进程会崩执行器，见文件头注释）
  writeFileSync('/tmp/p2-smoke-service.pid', String(child.pid))
  writeFileSync(CONFIG_PATH, originalConfig)
  alistMock.close()
  webdavMock.close()
}

console.log(`\n===== ${passCount} PASS / ${failures.length} FAIL =====`)
if (failures.length) {
  console.log('失败项:')
  for (const f of failures) console.log('  - ' + f)
  console.log('\n被测服务日志(尾部):')
  console.log(serviceLogs.join('').split('\n').slice(-40).join('\n'))
  exitCode = 1
}
process.exit(exitCode)
