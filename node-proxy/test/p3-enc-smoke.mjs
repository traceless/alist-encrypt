/**
 * P3 加密链路端到端冒烟（node 编写，可驱动任意被测运行时）—— 闭环设计：
 *
 *   上传（PUT）→ 代理加密 → mock 上游收到「密文」→ 测试脚本用 node 原生实现解密对拍
 *   下载（GET/Range）→ mock 回吐「密文」→ 代理解密 → 客户端收到「明文」
 *   名字链路 → 上游收到 encodeName 产物 / 客户端看到 decodeName 还原的明文名
 *
 * 闭环不依赖被测端自身实现（测试脚本独立用 node 加密解密），互通性由闭环保证。
 * 覆盖：webdav PUT/GET/Range（aesctr+chacha20）、alist fs/put（名字+内容加密）、
 *       fs/list 名字解密改写、/p/ 下载解密（含 Range seek）。
 *
 * 用法（cwd=node-proxy）：
 *   node test/p3-enc-smoke.mjs                          # 被测 = node app.js
 *   node test/p3-enc-smoke.mjs [--verbose] -- <command> # 被测 = 自定义命令
 *   例：node test/p3-enc-smoke.mjs -- ../tjs-build/dist/tjs-glibc run --import-map tjs.importmap.json app.tjs.js
 *
 * 注意：同 p2-tjs-smoke.mjs，不杀被测服务，PID 写 /tmp/p3-smoke-service.pid 由调用方清理。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync } from 'node:fs'
import FlowEnc from '../src/utils/flowEnc.js'
import { decodeName } from '../src/utils/commonUtil.js'

const PROXY_PORT = 5344
const ALIST_PORT = 5244
const WEBDAV_PORT = 5245
const BASE = `http://127.0.0.1:${PROXY_PORT}`
const CONFIG_PATH = 'conf/config.json'
const PASSWORD = '123456'

// ============================== 断言 runner ==============================
let passCount = 0
const failures = []
function ok(cond, name, extra = '') {
  if (cond) {
    passCount++
    console.log(`  PASS ${name}`)
  } else {
    failures.push(name + (extra ? ` | ${extra}` : ''))
    console.log(`  FAIL ${name} ${extra}`)
  }
}

// ============================== 测试数据 ==============================
function makePayload(size) {
  const buf = Buffer.alloc(size)
  for (let i = 0; i < size; i++) buf[i] = (i * 7 + (i % 13)) % 251
  return buf
}
const DAV_PLAIN = makePayload(200 * 1024)
const ALIST_PLAIN = makePayload(150 * 1024)
const CHA_PLAIN = makePayload(65 * 1024 + 1)

function decryptFlow(encType, fileSize, cipherBuf) {
  const fe = new FlowEnc(PASSWORD, encType, fileSize)
  return Buffer.from(fe.encryptFlow.decrypt(cipherBuf))
}

// ============================== mock 上游 ==============================
// webdav mock：记录 PUT 收到的密文与最终 URL，GET 回吐密文（支持 Range 切片）
const davRecord = { url: null, cipher: null, chaUrl: null, chaCipher: null }
const alistRecord = { encBase: null, ext: null, cipher: null, putFilePath: null }

function serveCipher(res, cipher, req) {
  const range = req.headers.range
  if (range) {
    const start = range.replace('bytes=', '').split('-')[0] * 1
    res.statusCode = 206
    res.setHeader('content-range', `bytes ${start}-${cipher.length - 1}/${cipher.length}`)
    res.end(cipher.subarray(start))
    return
  }
  res.end(cipher)
}

const webdavMock = await startMock(WEBDAV_PORT, (req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    if (req.method === 'PUT') {
      const isCha = req.url.includes('chafold')
      if (isCha) {
        davRecord.chaUrl = req.url
        davRecord.chaCipher = body
      } else {
        davRecord.url = req.url
        davRecord.cipher = body
      }
      res.statusCode = 201
      res.end('created')
      return
    }
    if (req.method === 'GET') {
      const isCha = req.url.includes('chafold')
      const cipher = isCha ? davRecord.chaCipher : davRecord.cipher
      if (cipher && req.url === (isCha ? davRecord.chaUrl : davRecord.url)) {
        serveCipher(res, cipher, req)
        return
      }
    }
    res.statusCode = 404
    res.end('webdav mock not found: ' + req.url)
  })
})

const alistMock = await startMock(ALIST_PORT, (req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    if (req.method === 'PUT' && req.url === '/api/fs/put') {
      alistRecord.cipher = body
      alistRecord.putFilePath = decodeURIComponent(req.headers['file-path'] || '')
      // fs/put 的文件名 = encodeName(明文名) + 原扩展名
      const base = alistRecord.putFilePath.split('/').pop()
      alistRecord.ext = base.replace(/^.*(\.[^./]*)$/, '$1')
      alistRecord.encBase = base.slice(0, base.length - alistRecord.ext.length)
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ code: 200, message: 'success', data: null }))
      return
    }
    if (req.method === 'POST' && req.url === '/api/fs/list') {
      res.setHeader('content-type', 'application/json')
      res.end(
        JSON.stringify({
          code: 200,
          message: 'success',
          data: {
            content: [{ name: alistRecord.encBase + alistRecord.ext, size: alistRecord.cipher.length, is_dir: false, type: 2 }],
            total: 1,
          },
        })
      )
      return
    }
    if (req.method === 'GET' && req.url === `/p/encfold/${alistRecord.encBase}${alistRecord.ext}`) {
      serveCipher(res, alistRecord.cipher, req)
      return
    }
    res.statusCode = 404
    res.end('alist mock not found: ' + req.url)
  })
})

function startMock(port, handler) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler)
    server.on('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

// ============================== 配置改写 ==============================
const originalConfig = readFileSync(CONFIG_PATH, 'utf8')
function writeSmokeConfig() {
  const config = JSON.parse(originalConfig)
  config.alistServer.serverHost = '127.0.0.1'
  config.alistServer.serverPort = String(ALIST_PORT)
  const alistPasswd = config.alistServer.passwdList[0]
  alistPasswd.enable = true
  alistPasswd.password = PASSWORD
  alistPasswd.encType = 'aesctr'
  alistPasswd.encName = true
  alistPasswd.encFolder = false
  alistPasswd.encSuffix = ''
  alistPasswd.encPath = ['encfold/.*']
  for (let i = 1; i < config.alistServer.passwdList.length; i++) config.alistServer.passwdList[i].enable = false

  const dav = config.webdavServer.find((w) => /aliyun-dav/.test(w.path)) || config.webdavServer[0]
  dav.serverHost = '127.0.0.1'
  dav.serverPort = String(WEBDAV_PORT)
  dav.enable = true
  dav.passwdList = [
    {
      id: 1,
      password: PASSWORD,
      encType: 'aesctr',
      enable: true,
      encName: true,
      encFolder: false,
      encSuffix: '',
      describe: 'p3 smoke aesctr',
      encPath: ['encup'],
    },
    {
      id: 2,
      password: PASSWORD,
      encType: 'chacha20',
      enable: true,
      encName: true,
      encFolder: false,
      encSuffix: '',
      describe: 'p3 smoke chacha20',
      encPath: ['chafold'],
    },
  ]
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
writeFileSync('/tmp/p3-config-backup.json', originalConfig)

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

  console.log('--- webdav 加密闭环（aesctr）---')

  // P1 PUT 加密上传：上游收到密文，node 原生解密 == 明文
  const p1 = await fetch(`${BASE}/aliyun-dav/encup/enc-upload.txt`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(DAV_PLAIN.length) },
    body: DAV_PLAIN,
  })
  ok(p1.status === 201, 'P1 PUT 加密上传 201', `status=${p1.status}`)
  ok(
    davRecord.cipher && decryptFlow('aesctr', DAV_PLAIN.length, davRecord.cipher).equals(DAV_PLAIN),
    'P1 上游密文可解密还原明文',
    `cipherLen=${davRecord.cipher?.length}`
  )
  ok(davRecord.url && !davRecord.url.includes('enc-upload'), 'P1 文件名已加密改写', `url=${davRecord.url}`)

  // P2 GET 解密下载：上游回密文，客户端收到明文
  const p2 = await fetch(`${BASE}${davRecord.url}`)
  const p2buf = Buffer.from(await p2.arrayBuffer())
  ok(p2.status === 200 && p2buf.equals(DAV_PLAIN), 'P2 GET 解密下载还原明文', `status=${p2.status} len=${p2buf.length}`)

  // P3 Range seek 解密
  const p3 = await fetch(`${BASE}${davRecord.url}`, { headers: { range: 'bytes=1000-' } })
  const p3buf = Buffer.from(await p3.arrayBuffer())
  ok(
    p3.status === 206 && p3buf.equals(DAV_PLAIN.subarray(1000)),
    'P3 Range seek 解密',
    `status=${p3.status} len=${p3buf.length} expect=${DAV_PLAIN.length - 1000}`
  )

  console.log('--- webdav 加密闭环（chacha20，FFI/JS 内核）---')

  // P4 chacha20 PUT+GET 闭环
  const p4 = await fetch(`${BASE}/aliyun-dav/chafold/cha-upload.txt`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(CHA_PLAIN.length) },
    body: CHA_PLAIN,
  })
  ok(p4.status === 201, 'P4 chacha20 PUT 201', `status=${p4.status}`)
  ok(
    davRecord.chaCipher && decryptFlow('chacha20', CHA_PLAIN.length, davRecord.chaCipher).equals(CHA_PLAIN),
    'P4 chacha20 上游密文可解密还原',
    `cipherLen=${davRecord.chaCipher?.length}`
  )
  const p4g = await fetch(`${BASE}${davRecord.chaUrl}`)
  const p4buf = Buffer.from(await p4g.arrayBuffer())
  ok(p4g.status === 200 && p4buf.equals(CHA_PLAIN), 'P4 chacha20 GET 解密还原', `len=${p4buf.length}`)

  console.log('--- alist 加密闭环（aesctr：名字+内容）---')

  // P5 fs/put：名字加密 + 内容加密
  const p5 = await fetch(`${BASE}/api/fs/put`, {
    method: 'PUT',
    headers: {
      'content-type': 'application/octet-stream',
      'file-path': encodeURIComponent('/encfold/展示名.txt'),
      'content-length': String(ALIST_PLAIN.length),
    },
    body: ALIST_PLAIN,
  })
  ok(p5.status === 200, 'P5 fs/put 200', `status=${p5.status}`)
  ok(
    alistRecord.encBase && decodeName(PASSWORD, 'aesctr', alistRecord.encBase) === '展示名.txt',
    'P5 上游文件名为 encodeName 产物',
    `encBase=${alistRecord.encBase} ext=${alistRecord.ext}`
  )
  ok(
    alistRecord.cipher && decryptFlow('aesctr', ALIST_PLAIN.length, alistRecord.cipher).equals(ALIST_PLAIN),
    'P5 上传内容密文可解密还原',
    `cipherLen=${alistRecord.cipher?.length}`
  )

  // P6 fs/list：密文名解密展示
  const p6 = await fetch(`${BASE}/api/fs/list`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ path: '/encfold', password: '', page: 1, per_page: 10, refresh: false }),
  })
  const p6json = await p6.json()
  ok(
    p6.status === 200 && p6json.data?.content?.[0]?.name === '展示名.txt',
    'P6 fs/list 密文名解密展示',
    `status=${p6.status} body=${JSON.stringify(p6json).slice(0, 150)}`
  )

  // P7 /p/ 下载解密
  const p7 = await fetch(`${BASE}/p/encfold/${encodeURIComponent(alistRecord.encBase + alistRecord.ext)}`)
  const p7buf = Buffer.from(await p7.arrayBuffer())
  ok(p7.status === 200 && p7buf.equals(ALIST_PLAIN), 'P7 /p/ 下载解密还原明文', `status=${p7.status} len=${p7buf.length}`)

  // P8 /p/ Range seek 解密
  const p8 = await fetch(`${BASE}/p/encfold/${encodeURIComponent(alistRecord.encBase + alistRecord.ext)}`, {
    headers: { range: 'bytes=500-' },
  })
  const p8buf = Buffer.from(await p8.arrayBuffer())
  ok(
    p8.status === 206 && p8buf.equals(ALIST_PLAIN.subarray(500)),
    'P8 /p/ Range seek 解密',
    `status=${p8.status} len=${p8buf.length} expect=${ALIST_PLAIN.length - 500}`
  )
} catch (e) {
  failures.push('EXCEPTION: ' + e.message)
  console.error('冒烟异常:', e)
  exitCode = 1
} finally {
  writeFileSync('/tmp/p3-smoke-service.pid', String(child.pid))
  writeFileSync(CONFIG_PATH, originalConfig)
  webdavMock.close()
  alistMock.close()
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
