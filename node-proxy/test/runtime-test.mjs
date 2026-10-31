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

async function main() {
  console.log(`=== runtime-test @ ${RUNTIME} ===`)
  suiteProbe()
  await suiteHashing()
  suitePaths()
  await suitePathsNodeDiff()
  await suiteEnvx()
  console.log(`\n===== 汇总: PASS=${pass} FAIL=${fail} =====`)
  console.log(fail === 0 ? '=== RUNTIME OK ===' : '=== RUNTIME FAILED ===')
  if (fail !== 0) fatalExit(1)
}

main()
