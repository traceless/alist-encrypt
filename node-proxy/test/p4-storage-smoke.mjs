/**
 * P4 存储/配置/日志专项冒烟 —— 跨进程持久化验证
 *
 * 背景：P4 计划范围（levelDB→tjs:sqlite、config、logger、env 适配层）已在 P1 R3/R4/R5
 * 波次提前双端化完成，无代码缺口。本脚本补齐此前所有冒烟缺失的验证维度：
 * 此前均为单进程内验证，以下三项从未跨进程证明过——
 *   V1 KV 持久化： fileInfo 缓存写入 sqlite → 进程退出重启 → KV 命中
 *      （观测方式：重启后 webdav GET 解密成功，fileInfo.size 只能来自 sqlite 落盘；
 *        若 KV 未持久化则 getFileInfo 落入无 authorization 分支报错，响应非 200）
 *   V2 日志文件： logs/server.log 存在且含 [INFO] 行（tjs 为 tjs.open('a') 追加句柄）
 *   V3 .env 加载： RUN_MODE=DEV → logger 级别放宽，stdout 出现 [DEBUG] 行（envx loadEnv）
 *
 * 用法（cwd=node-proxy）：
 *   node test/p4-storage-smoke.mjs                          # 被测 = node app.js
 *   node test/p4-storage-smoke.mjs [--verbose] -- <command> # 被测 = 自定义命令
 *   例：node test/p4-storage-smoke.mjs -- ../tjs-build/dist/tjs-glibc run --import-map tjs.importmap.json app.tjs.js
 *
 * 注意：本脚本会 kill 自己 spawn 的被测子进程（跨进程重启是验证目标本身），
 *       config.json/.env/logs 由脚本备份还原，conf/nedb/datafile.db 保留（KV 持久化介质）。
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'

const PROXY_PORT = 5344
const WEBDAV_PORT = 5245
const BASE = `http://127.0.0.1:${PROXY_PORT}`
const CONFIG_PATH = 'conf/config.json'
const ENV_PATH = '.env'
const LOG_PATH = 'logs/server.log'

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

function makePayload(size) {
  const buf = Buffer.alloc(size)
  for (let i = 0; i < size; i++) buf[i] = (i * 11 + (i % 17)) % 253
  return buf
}
const PLAIN = makePayload(128 * 1024)
const PASSWORD = '123456'

// ============================== webdav mock ==============================
const davRecord = { url: null, cipher: null }
const webdavMock = await new Promise((resolve, reject) => {
  const server = createServer((req, res) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      if (req.method === 'PUT') {
        davRecord.url = req.url
        davRecord.cipher = Buffer.concat(chunks)
        res.statusCode = 201
        res.end('created')
        return
      }
      if (req.method === 'GET' && req.url === davRecord.url) {
        res.end(davRecord.cipher)
        return
      }
      res.statusCode = 404
      res.end('mock not found: ' + req.url)
    })
  })
  server.on('error', reject)
  server.listen(WEBDAV_PORT, '127.0.0.1', () => resolve(server))
})

// ============================== 配置备份/改写 ==============================
const originalConfig = readFileSync(CONFIG_PATH, 'utf8')
const originalEnv = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : null
function writeSmokeConfig() {
  const config = JSON.parse(originalConfig)
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
      describe: 'p4 smoke',
      encPath: ['p4kv'],
    },
  ]
  config.port = PROXY_PORT
  writeFileSync(CONFIG_PATH, JSON.stringify(config, '', '\t'))
}

function waitForProxy(childRef, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        await fetch(`${BASE}/enc-api/getWebdavConfig`)
        resolve()
      } catch {
        if (Date.now() > deadline) return reject(new Error('被测服务启动超时'))
        setTimeout(poll, 300)
      }
    }
    poll()
  })
}

// ============================== 服务生命周期 ==============================
const argv = process.argv.slice(2)
const verbose = argv.includes('--verbose')
const sep = argv.indexOf('--')
const cmdArgs = sep === -1 ? null : argv.slice(sep + 1)
const [cmd, ...rest] = cmdArgs || [process.execPath, 'app.js']

function startService(tag) {
  const logs = []
  const child = spawn(cmd, rest, { stdio: ['ignore', 'pipe', 'pipe'] })
  const collect = (buf) => {
    logs.push(buf.toString())
    if (verbose) process.stdout.write(`[${tag}] ` + buf.toString())
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  child.logs = logs
  return child
}
const killService = (child) =>
  new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (!done) {
        done = true
        resolve()
      }
    }
    child.on('exit', finish)
    child.kill('SIGTERM')
    // SIGTERM 可能未终止（沙箱/信号拦截场景），兜底 SIGKILL
    setTimeout(() => {
      if (!done) {
        try {
          child.kill('SIGKILL')
        } catch {}
        setTimeout(finish, 1000)
      }
    }, 3000)
  })

/** 等待代理端口释放（ECONNREFUSED），防止 GET 打到幸存旧进程造成假通过 */
async function waitPortFree(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await fetch(`${BASE}/enc-api/getWebdavConfig`)
    } catch (e) {
      if ((e?.cause?.code || e?.code) === 'ECONNREFUSED') return true
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  return false
}

writeSmokeConfig()
writeFileSync(ENV_PATH, 'RUN_MODE=DEV\n')

let exitCode = 0
let svc2 = null
let logSizeBefore = existsSync(LOG_PATH) ? readFileSync(LOG_PATH, 'utf8').length : 0
try {
  // -------- 第一次启动：上传 + KV 写入 --------
  console.log(`被测命令: ${cmd} ${rest.join(' ')}`)
  const svc1 = startService('run1')
  await waitForProxy(svc1)

  const p1 = await fetch(`${BASE}/aliyun-dav/p4kv/p4file.txt`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream', 'content-length': String(PLAIN.length) },
    body: PLAIN,
  })
  ok(p1.status === 201, 'V0 PUT 加密上传 201', `status=${p1.status}`)

  await killService(svc1)
  ok(await waitPortFree(), 'run1 已终止且端口释放（重启验证的前置真实性保障）')
  console.log('服务已重启（KV 落盘验证点）')

  // -------- 第二次启动：KV 持久化 + .env + 日志文件 --------
  svc2 = startService('run2')
  await waitForProxy(svc2)

  // V1: 重启后 GET —— fileInfo.size 只能来自 sqlite 持久化（内存缓存已随进程消失）
  const p2 = await fetch(`${BASE}${davRecord.url}`)
  const p2buf = Buffer.from(await p2.arrayBuffer())
  ok(p2.status === 200 && p2buf.equals(PLAIN), 'V1 KV 持久化：重启后 fileInfo 命中并解密成功', `status=${p2.status} len=${p2buf.length}`)

  // V2: server.log 追加写入（两次运行均落盘）
  ok(existsSync(LOG_PATH), 'V2 logs/server.log 存在')
  const logText = existsSync(LOG_PATH) ? readFileSync(LOG_PATH, 'utf8') : ''
  ok(logText.includes('[INFO]'), 'V2 server.log 含 [INFO] 行')
  ok(logText.length > logSizeBefore, 'V2 server.log 本次运行有追加', `before=${logSizeBefore} after=${logText.length}`)

  // V3: .env RUN_MODE=DEV → debug 级日志出现
  const allLogs = svc1.logs.join('') + svc2.logs.join('')
  ok(allLogs.includes('[DEBUG]'), 'V3 .env RUN_MODE=DEV 生效（stdout 出现 [DEBUG]）')
} catch (e) {
  failures.push('EXCEPTION: ' + e.message)
  console.error('冒烟异常:', e)
  exitCode = 1
} finally {
  if (svc2) await killService(svc2)
  await waitPortFree().catch(() => {})
  writeFileSync(CONFIG_PATH, originalConfig)
  if (originalEnv === null) {
    rmSync(ENV_PATH, { force: true })
  } else {
    writeFileSync(ENV_PATH, originalEnv)
  }
  webdavMock.close()
}

console.log(`\n===== ${passCount} PASS / ${failures.length} FAIL =====`)
if (failures.length) {
  console.log('失败项:')
  for (const f of failures) console.log('  - ' + f)
  exitCode = 1
}
process.exit(exitCode)
