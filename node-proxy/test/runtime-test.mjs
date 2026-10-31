/**
 * P1 运行时适配层双端测试（runtime/isTjs + hashing + paths）
 *
 * 单文件双运行时（与 crypto-golden-test.mjs 同模式）：
 *   node  test/runtime-test.mjs   # node 端：paths 与 node:path 原生逐项对拍
 *   tjs   test/runtime-test.mjs   # tjs 端：锁定向量断言（向量即 node 原生输出）
 *
 * hashing 向量均为公开标准向量 / crypto-golden.json 派生链向量（内嵌快照），
 * 双端各自断言同一期望值，即锁死双端一致性。
 */
'use strict'

import { IS_TJS, RUNTIME, cwd, fatalExit } from '../src/runtime/isTjs.js'
import { createHash, pbkdf2, randomUUID, toHex } from '../src/runtime/hashing.js'
import * as p from '../src/runtime/paths.js'

let pass = 0
let fail = 0

function assertEq(name, got, want) {
  if (got === want) {
    pass++
    console.log(`PASS ${name}`)
  } else {
    fail++
    console.log(`FAIL ${name} got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}

function assertTrue(name, cond) {
  assertEq(name, cond, true)
}

const enc = new TextEncoder()

// ---------- R0 isTjs ----------
function suiteProbe() {
  assertEq('probe RUNTIME', RUNTIME, IS_TJS ? 'tjs' : 'node')
  assertTrue('probe cwd is abs', p.isAbsolute(cwd()))
}

// ---------- R1 hashing ----------
async function suiteHashing() {
  // 标准向量（FIPS/RFCA 共知）
  assertEq('md5 hex', createHash('md5').update('abc').digest('hex'), '900150983cd24fb0d6963f7d28e17f72')
  assertEq('md5 bytes', toHex(createHash('md5').update('abc').digest()), '900150983cd24fb0d6963f7d28e17f72')
  assertEq('sha256 hex', createHash('sha256').update('abc').digest('hex'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  // 链式多段 update == 单次（流式一致性）
  assertEq('md5 chained', createHash('md5').update('a').update('b').update('c').digest('hex'), '900150983cd24fb0d6963f7d28e17f72')
  // Uint8Array 与 string 等价
  assertEq('md5 bytes-input', toHex(createHash('md5').update(enc.encode('abc')).digest()), '900150983cd24fb0d6963f7d28e17f72')
  // 派生链向量：pbkdf2('123456','AES-CTR',1000,16,'sha256') —— crypto-golden.json derive.aesctr-0.passwdOutward
  assertEq('pbkdf2 aesctr-chain', toHex(await pbkdf2('123456', 'AES-CTR', 1000, 16, 'sha256')), 'a833e459f4e0e47b4b0215c11c518ab2')
  // CHA20 盐支路：pbkdf2('123456','CHA20',1000,16,'sha256') —— crypto-golden.json derive.chacha20-0.passwdOutward
  assertEq('pbkdf2 chacha-chain', toHex(await pbkdf2('123456', 'CHA20', 1000, 16, 'sha256')), 'f6156a1c02b28aab424f42aa67a50a1a')
  // UUID v4 形态
  assertTrue('randomUUID v4', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(randomUUID()))
}

// ---------- R2 paths ----------
// 期望值全部为 node v22.23.4 原生 path 实测输出；node 端额外与原生对拍
const PATH_CASES = [
  ['join3', ['join', '/a/b', '../c', 'd/'], '/a/c/d/'],
  ['join0', ['join'], '.'],
  ['join-slashes', ['join', 'a//b//'], 'a/b/'],
  ['norm-dotdot', ['normalize', '/a/b/../c'], '/a/c'],
  ['norm-slashes', ['normalize', 'a//b/'], 'a/b/'],
  ['dirname1', ['dirname', '/a/b/c'], '/a/b'],
  ['dirname-rel', ['dirname', 'a'], '.'],
  ['basename-ext', ['basename', '/a/b/c.txt', '.txt'], 'c'],
  ['basename-trail', ['basename', '/a/b/'], 'b'],
  ['extname-2dots', ['extname', 'a.tar.gz'], '.gz'],
  ['extname-dotfile', ['extname', '.bashrc'], ''],
  ['resolve-abs', ['resolve', '/a', 'b/../c'], '/a/c'],
  ['isAbsolute-empty', ['isAbsolute', ''], false],
  ['isAbsolute-rel', ['isAbsolute', 'a/b'], false],
  ['isAbsolute-abs', ['isAbsolute', '/a'], true],
]

function suitePaths() {
  for (const [name, [fn, ...args], want] of PATH_CASES) {
    assertEq(`path ${name}`, p[fn](...args), want)
  }
  assertEq('path sep', p.sep, '/')
  assertEq('path delimiter', p.delimiter, ':')
}

// node 端专属：与 node:path 原生逐项对拍（未来 node 升级语义漂移立即暴露）
async function suitePathsNodeDiff() {
  if (IS_TJS) return
  const native = await import('node:path')
  const wrap = {
    resolve: p.resolve,
    normalize: p.normalize,
    isAbsolute: p.isAbsolute,
    join: p.join,
    relative: p.relative,
    dirname: p.dirname,
    basename: p.basename,
    extname: p.extname,
  }
  let idx = 0
  for (const [fn, args] of [
    ['join', ['x/y', '..', 'z/']],
    ['join', ['', 'a', '', '/b/']],
    ['normalize', './a/../b/./c'],
    ['normalize', '/a/../../b'],
    ['dirname', 'a/b/'],
    ['dirname', '/'],
    ['basename', 'a.txt'],
    ['basename', '/a/b/c', 'c'],
    ['extname', 'a'],
    ['extname', 'a.b.c'],
    ['resolve', 'a', 'b'],
    ['resolve', '/a', ''],
    ['relative', '/a/b', '/a/c'],
    ['relative', 'a/b', 'a/c'],
    ['isAbsolute', '///a'],
  ]) {
    assertEq(`node-diff #${idx++} ${fn}`, wrap[fn](...args), native[fn](...args))
  }
}

// ---------- R3 envx ----------
async function suiteEnvx() {
  const { loadEnv, envGet, envSet } = await import('../src/runtime/envx.js')
  // 预置：不覆盖已有值语义
  envSet('F_EXIST', 'keep-value')
  // 写临时 env 文件（node:fs.writeFileSync / tjs:fs.writeFile）
  const envPath = `${cwd()}/.env.test.tmp`
  const content = [
    'A_SIMPLE=1',
    'export B_EXPORT=2',
    'C_QUOTED="x\\ny"',
    "D_SQUOTE='v#not-comment'",
    'E_COMMENT=v # comment',
    'F_EXIST=should-not-override',
    '',
  ].join('\n')
  if (IS_TJS) {
    // tjs fs 能力挂全局 tjs 对象（无 'tjs:fs' 模块）
    await tjs.writeFile(envPath, new TextEncoder().encode(content))
  } else {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(envPath, content)
  }
  await loadEnv(envPath)
  assertEq('envx simple', envGet('A_SIMPLE'), '1')
  assertEq('envx export-prefix', envGet('B_EXPORT'), '2')
  assertEq('envx dquote-escape', envGet('C_QUOTED'), 'x\ny')
  assertEq('envx squote-hash', envGet('D_SQUOTE'), 'v#not-comment')
  assertEq('envx line-comment', envGet('E_COMMENT'), 'v')
  assertEq('envx no-override', envGet('F_EXIST'), 'keep-value')
  // 不存在的文件静默跳过（不抛）
  await loadEnv(`${cwd()}/.env.nonexistent.check`)
  assertTrue('envx missing-file silent', true)
  // 清理临时文件
  if (IS_TJS) {
    tjs.remove(envPath)
  } else {
    ;(await import('node:fs')).unlinkSync(envPath)
  }
}

// ---------- R4 fsx ----------
async function suiteFsx() {
  const fsx = await import('../src/runtime/fsx.js')
  const base = `${cwd()}/.fsx-test-tmp`
  await fsx.rm(base, { recursive: true }).catch(() => {})
  await fsx.mkdir(`${base}/sub/deep`, { recursive: true })
  assertTrue('fsx mkdir-recursive exists', await fsx.exists(`${base}/sub/deep`))
  assertEq('fsx exists-missing', await fsx.exists(`${base}/nope`), false)
  await fsx.writeFile(`${base}/f.txt`, 'hello-fsx')
  assertEq('fsx readFileText', await fsx.readFileText(`${base}/f.txt`), 'hello-fsx')
  const raw = await fsx.readFile(`${base}/f.txt`)
  assertTrue('fsx readFile bytes', raw instanceof Uint8Array && raw.length === 9)
  await fsx.writeFile(`${base}/b.bin`, new TextEncoder().encode('bin-42'))
  assertEq('fsx readFile bin', new TextDecoder().decode(await fsx.readFile(`${base}/b.bin`)), 'bin-42')
  await fsx.rename(`${base}/f.txt`, `${base}/g.txt`)
  assertTrue('fsx rename old-gone', !(await fsx.exists(`${base}/f.txt`)))
  assertEq('fsx rename new-here', await fsx.readFileText(`${base}/g.txt`), 'hello-fsx')
  const names = (await fsx.readdir(base)).sort()
  assertEq('fsx readdir', names.join(','), 'b.bin,g.txt,sub')
  const st = await fsx.stat(`${base}/g.txt`)
  assertTrue('fsx stat file', st.isFile() && !st.isDirectory() && st.size === 9)
  const stDir = await fsx.stat(`${base}/sub`)
  assertTrue('fsx stat dir', stDir.isDirectory())
  await fsx.rm(base, { recursive: true })
  assertTrue('fsx rm-recursive', !(await fsx.exists(base)))
}

// ---------- R5 formatx ----------
// 决策：项目日志 0 占位符使用，formatx 不支持占位符（% 原样输出）；
// 向量即 node v22.23.4 原生 util.format 无占位符路径 + inspect 实测输出
const FORMAT_CASES = [
  ['plain-1arg', ['a'], 'a'],
  ['plain-0args', [], ''],
  ['plain-multi-str', ['a', 'b', 'c'], 'a b c'],
  ['plain-mixed', [1, 'a', { x: 1 }], '1 a { x: 1 }'],
  ['plain-obj', [{ x: 1 }], '{ x: 1 }'],
  ['plain-empty-obj-arr', [{}, []], '{} []'],
  ['plain-date', [new Date(0)], '1970-01-01T00:00:00.000Z'],
  ['plain-specials', [NaN, -0, Infinity], 'NaN -0 Infinity'],
  ['plain-bigint', [1n], '1n'],
  ['plain-symbol', [Symbol('x')], 'Symbol(x)'],
  ['plain-regexp', [/re/g], '/re/g'],
  ['plain-prims', [true, null, undefined], 'true null undefined'],
  ['pct-literal', ['100% done'], '100% done'],
  ['pct-no-support', ['x=%s', 1], 'x=%s 1'],
  ['i-arr', [[1, 2]], '[ 1, 2 ]'],
  ['i-nested3', [{ a: { b: { c: 1 } } }], '{ a: { b: { c: 1 } } }'],
  ['i-nested4', [{ a: { b: { c: { d: 1 } } } }], '{ a: { b: { c: [Object] } } }'],
  ['i-nested-arr', [{ a: { b: [1] } }], '{ a: { b: [ 1 ] } }'],
  ['i-mixed', [{ a: 1, b: { c: [2] } }], '{ a: 1, b: { c: [ 2 ] } }'],
  ['i-numkey', [{ 1: 'x' }], "{ '1': 'x' }"],
  ['i-zerokey', [{ 0: 1 }], "{ '0': 1 }"],
  ['i-dashkey', [{ 'a-b': 1 }], "{ 'a-b': 1 }"],
  ['i-spacekey', [{ 'a b': 1 }], "{ 'a b': 1 }"],
  ['i-symkey', [{ [Symbol('s')]: 1, a: 2 }], '{ a: 2, [Symbol(s)]: 1 }'],
  ['i-map', [new Map([['a', 1]])], "Map(1) { 'a' => 1 }"],
  ['i-set', [new Set([1, 'x'])], "Set(2) { 1, 'x' }"],
  ['i-map-empty', [new Map()], 'Map(0) {}'],
  ['i-set-empty', [new Set()], 'Set(0) {}'],
  ['i-u8', [new Uint8Array([1, 2, 3])], 'Uint8Array(3) [ 1, 2, 3 ]'],
  ['i-quote-field', [{ k: "a'b" }], `{ k: "a'b" }`],
  ['i-escape-field', [{ k: 'a\nb' }], "{ k: 'a\\nb' }"],
  ['i-fn-named', [function foo() {}], '[Function: foo]'],
  ['i-fn-anon', [() => {}], '[Function (anonymous)]'],
]

async function suiteFormatx() {
  const { format } = await import('../src/runtime/formatx.js')
  for (const [name, args, want] of FORMAT_CASES) {
    assertEq(`fmt ${name}`, format(...args), want)
  }
  // Error 精简形态（不带堆栈）：断言前缀
  assertTrue('fmt err-prefix', format(new Error('boom')).startsWith('Error: boom'))
  // node 端：与原生 util.format 逐项对拍（pct-no-support 为有意差异，排除；防止向量本身写错）
  if (!IS_TJS) {
    const { format: native } = await import('util')
    for (const [name, args, want] of FORMAT_CASES) {
      if (name === 'pct-no-support') continue
      assertEq(`fmt-native ${name}`, want, native(...args))
    }
  }
}

// ---------- R6 workerx ----------
// node：真 worker_threads 收发一轮（对齐 PRGA 模式：msgId once + postMessage 回声）
// tjs：无线程能力（26.6.0 实测），同步 shim + registerWorkerTask，断言同一收发语义
async function suiteWorkerx() {
  const wt = await import('../src/runtime/workerx.js')
  assertTrue('wt isMainThread', wt.isMainThread === true)
  assertTrue('wt cpusCount>0', wt.cpusCount() > 0)
  const echo = (data) => ({ echo: data, doubled: typeof data.n === 'number' ? data.n * 2 : null })
  let worker
  if (IS_TJS) {
    wt.registerWorkerTask(echo)
    worker = new wt.Worker(null, { workerData: 'tjs-shim' })
  } else {
    worker = new wt.Worker(new URL('./workerx-echo-worker.mjs', import.meta.url), { workerData: 'node-worker' })
  }
  const got = await new Promise((resolve, reject) => {
    worker.on('error', reject)
    // 对齐 PRGAThread 的分发模式：message 事件按 msgId 二次派发
    worker.on('message', ({ msgId, resData }) => worker.emit(msgId, resData))
    worker.once('reply-1', resolve)
    worker.postMessage({ msgId: 'reply-1', data: { n: 21, tag: 'x' } })
  })
  // 对齐 PRGAExcuteThread 语义：once(msgId, res => ...) 的 res 即内层 resData（计算结果）
  assertEq('wt echo doubled', got.doubled, 42)
  assertEq('wt echo tag', got.echo.tag, 'x')
  if (!IS_TJS) await worker.terminate()
  // once 自动清理（tjs shim 语义；node EventEmitter 原生）
  if (IS_TJS) {
    worker.postMessage({ msgId: 'reply-2', data: { n: 1 } })
    await new Promise((r) => setTimeout(r, 20))
    let fired = 0
    worker.once('reply-3', () => fired++)
    worker.postMessage({ msgId: 'reply-3', data: { n: 2 } })
    await new Promise((r) => setTimeout(r, 20))
    assertEq('wt once-once', fired, 1)
  }
}

async function main() {
  console.log(`=== runtime-test @ ${RUNTIME} ===`)
  suiteProbe()
  await suiteHashing()
  suitePaths()
  await suitePathsNodeDiff()
  await suiteEnvx()
  await suiteFsx()
  await suiteFormatx()
  await suiteWorkerx()
  console.log(`\n===== 汇总: PASS=${pass} FAIL=${fail} =====`)
  console.log(fail === 0 ? '=== RUNTIME OK ===' : '=== RUNTIME FAILED ===')
  if (fail !== 0) fatalExit(1)
}

main()
