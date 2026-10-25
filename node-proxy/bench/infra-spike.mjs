/**
 * S3 基础设施抽查（仅 txiki.js 运行）
 *
 *   tjs bench/infra-spike.mjs
 *
 * 覆盖：tjs:sqlite（对齐 node:sqlite 用法）/ tjs:hashing 已知向量 /
 *       Web Worker（transferable）/ 文件追加流 / getenv/cwd/argv / setInterval
 */
'use strict'

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) {
    pass++
    console.log(`PASS ${name}`)
  } else {
    fail++
    console.log(`FAIL ${name} ${detail}`)
  }
}

async function testSqlite() {
  const { Database } = await import('tjs:sqlite')
  const path = '/tmp/tjs-spike-kv.db'
  await tjs.remove(path).catch(() => {})
  const db = new Database(path)
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('CREATE TABLE kv(key TEXT PRIMARY KEY, expire INTEGER, value TEXT)')
  db.exec('CREATE INDEX idx_expire ON kv(expire)')
  const ins = db.prepare('INSERT OR REPLACE INTO kv(key, expire, value) VALUES (?,?,?)')
  ins.run('userTable', null, JSON.stringify({ user: 'admin', token: 'x' }))
  ins.run('file:a', Date.now() + 60000, JSON.stringify({ size: 123 }))
  ins.run('file:b', Date.now() - 1, JSON.stringify({ size: 456 }))
  const one = db.prepare('SELECT value FROM kv WHERE key = ?').get('userTable')
  check('sqlite get 单条', one?.value && JSON.parse(one.value).user === 'admin', JSON.stringify(one))
  const rows = db.prepare('SELECT key FROM kv ORDER BY key').all()
  check('sqlite all 行数', rows.length === 3, JSON.stringify(rows))
  check('sqlite 返回对象数组形状', Array.isArray(rows) && typeof rows[0] === 'object' && 'key' in rows[0])
  db.prepare("DELETE FROM kv WHERE expire IS NOT NULL AND expire < ?").run(Date.now())
  const after = db.prepare('SELECT key FROM kv').all()
  check('sqlite 过期清理', after.length === 2, JSON.stringify(after))
  const mode = db.prepare('PRAGMA journal_mode').get?.() || db.prepare('PRAGMA journal_mode').all?.()
  check('sqlite WAL 生效', JSON.stringify(mode).toLowerCase().includes('wal'), JSON.stringify(mode))
  db.close()
}

async function testHashing() {
  const { createHash } = await import('tjs:hashing')
  const enc = new TextEncoder()
  const data = enc.encode('abc')
  const md5 = createHash('md5').update(data).digest()
  const sha256 = createHash('sha256').update(data).digest()
  check('md5 已知向量', md5 === '900150983cd24fb0d6963f7d28e17f72', md5)
  check(
    'sha256 已知向量',
    sha256 === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    sha256,
  )
  const bytes = createHash('md5').update(data).bytes()
  check('md5 bytes 长度 16', bytes instanceof Uint8Array && bytes.length === 16)
  // 流式 update（大输入分片）一致性
  const h = createHash('sha256')
  for (let i = 0; i < 10; i++) h.update(data)
  check('sha256 流式 update', h.digest() === createHash('sha256').update(enc.encode('abc'.repeat(10))).digest())
}

async function testWorker() {
  const worker = new Worker(new URL('./worker-child.mjs', import.meta.url))
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('worker timeout')), 10000)
    worker.onmessage = (e) => {
      clearTimeout(timer)
      resolve(e.data)
    }
    worker.onerror = (e) => {
      clearTimeout(timer)
      reject(new Error('worker error: ' + (e.message || 'unknown')))
    }
    const buf = new Uint8Array(4)
    for (let i = 0; i < 4; i++) buf[i] = i + 1
    worker.postMessage({ buf }, [buf.buffer])
  })
  check('Worker transferable 往返', result instanceof Uint8Array && result[0] === 2 && result[3] === 5, JSON.stringify([...(result || [])]))
  await worker.terminate?.()
}

async function testFsAndProcess() {
  // 追加流（logger 场景：tjs.open('a') + write）
  const logPath = '/tmp/tjs-spike-append.log'
  await tjs.remove(logPath).catch(() => {})
  const f = await tjs.open(logPath, 'a')
  const enc = new TextEncoder()
  for (let i = 0; i < 5; i++) {
    await f.write(enc.encode(`[2026-10-25T00:00:0${i}] [INFO] line ${i}\n`))
  }
  await f.close()
  const readBack = new TextDecoder().decode(await tjs.readFile(logPath))
  check('追加流 5 行保序', readBack.split('\n').filter(Boolean).length === 5 && readBack.endsWith('line 4\n'))

  // 整文件读写
  await tjs.writeFile('/tmp/tjs-spike-rw.bin', new Uint8Array([1, 2, 3, 4]))
  const bin = await tjs.readFile('/tmp/tjs-spike-rw.bin')
  check('readFile/writeFile 二进制', bin.length === 4 && bin[3] === 4)

  // 目录创建
  await tjs.mkdir('/tmp/tjs-spike-dir/nested', { recursive: true }).catch(async (e) => {
    // 兼容不同签名：目录创建失败时逐级创建
    await tjs.mkdir('/tmp/tjs-spike-dir').catch(() => {})
    await tjs.mkdir('/tmp/tjs-spike-dir/nested')
  })
  const st = await tjs.stat('/tmp/tjs-spike-dir/nested')
  check('mkdir recursive + stat', st.isDirectory?.() ?? false, JSON.stringify(st))

  // 环境与进程
  check('tjs.cwd 可用', typeof tjs.cwd() === 'string' && tjs.cwd().length > 0)
  check('tjs.argv 可用', Array.isArray(tjs.argv))
  check('tjs.getenv 可用', typeof tjs.getenv('PATH') === 'string' || tjs.getenv('PATH') === null)

  // 定时器（levelDB 30s 清理等价）
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 20)
    check('setTimeout/setInterval 存在', typeof t === 'object' || typeof t === 'number')
  })
}

async function main() {
  check('tjs.engine 版本信息', !!tjs.engine, JSON.stringify(tjs.engine?.versions || {}))
  await testHashing()
  await testSqlite()
  await testWorker()
  await testFsAndProcess()
  console.log(`=== infra-spike: ${pass} pass / ${fail} fail ===`)
  if (fail > 0) tjs.exit(1)
}

main()
