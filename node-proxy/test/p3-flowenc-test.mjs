/**
 * P3 正式出口金样测试：生产 FlowEnc（运行时分发后的真实出口）与 crypto-golden.json
 * 逐字节对拍 —— 与 test/crypto-golden-test.mjs（内核级）互补，本测试锁「分发出口」。
 *
 * 覆盖（双端运行）：
 *   1. 密码派生出口：FlowEnc.getPassWdOutward / 实例 passwdOutward/key vs golden derive
 *   2. 全量加密出口：encryptFlow.encrypt vs golden ciphertext（encType×sizeSalt×len 全组合）
 *   3. 流式 transform 出口：encryptTransform 收集 == 全量（node=Transform 流 / tjs=TransformStream）
 *   4. seek 解密：setPositionAsync 后 sync 解密段 == 明文段
 *   5. 名字链路：encodeName/decodeName 往返 + node 录制向量（跨运行时互通锁定）
 *
 * 用法：node test/p3-flowenc-test.mjs [--record]   # node 先录制名字向量
 *       tjs run --import-map tjs.importmap.json test/p3-flowenc-test.mjs
 */
import FlowEnc from '../src/utils/flowEnc.js'
import { encodeName, decodeName } from '../src/utils/commonUtil.js'
import { IS_TJS } from '../src/runtime/isTjs.js'
import '../src/runtime/globals.tjs.js'

// 双端文件读取：tjs 无 node:fs 兼容层，用全局 tjs.readFile；node 动态 import（crypto-golden-test.mjs 同款）
let nodeFs = null
async function readJson(path) {
  if (IS_TJS) {
    return JSON.parse(new TextDecoder().decode(await tjs.readFile(path)))
  }
  nodeFs = nodeFs || (await import('node:fs'))
  return JSON.parse(nodeFs.readFileSync(path, 'utf8'))
}
function readJsonOptional(path) {
  return readJson(path).catch(() => null)
}
async function writeJson(path, data) {
  // RECORD 仅 node 端
  nodeFs = nodeFs || (await import('node:fs'))
  nodeFs.writeFileSync(path, JSON.stringify(data, null, 2))
}

const GOLDEN_PATH = new URL('./crypto-golden.json', import.meta.url).pathname
const NAME_GOLDEN_PATH = new URL('./p3-name-golden.json', import.meta.url).pathname
const RECORD = !IS_TJS && process.argv.includes('--record')

const PASSWORD = '123456'
const SIZE_SALTS = [0, 1048577]
const CIPHER_LENS = [17, 65, 4097, 65535, 131072]
const SEEK_POS = 123457
const NAME_SAMPLES = ['test.txt', '电影_2024.4K.mkv', 'a very long file name with spaces and 多层目录/子目录/文档 v2 (最终版).pdf']

let pass = 0
let fail = 0
const failures = []

function report(name, ok, detail = '') {
  if (ok) {
    pass++
  } else {
    fail++
    failures.push(`${name}${detail ? ': ' + detail : ''}`)
    console.log(`  ✗ ${name} ${detail}`)
  }
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

// LCG 确定性明文（与 crypto-golden-test.mjs 一致）
function makePlaintext(len) {
  let s = 0x9e3779b9 >>> 0
  const out = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    out[i] = (s >>> 24) & 0xff
  }
  return out
}

// transform 收集（形态按运行时：node=Transform 流 / tjs=Web TransformStream）
async function collectTransform(transform, data) {
  if (!IS_TJS) {
    const { Readable, Writable } = await import('stream')
    const chunks = []
    await new Promise((resolve, reject) => {
      Readable.from([data])
        .pipe(transform)
        .pipe(
          new Writable({
            write(chunk, _enc, cb) {
              chunks.push(new Uint8Array(chunk))
              cb()
            },
          })
        )
        .on('finish', resolve)
        .on('error', reject)
    })
    return concat(chunks)
  }
  const chunks = []
  const reader = new ReadableStream({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    },
  })
  await reader.pipeThrough(transform).pipeTo(
    new WritableStream({
      write(chunk) {
        chunks.push(chunk)
      },
    })
  )
  return concat(chunks)
}

function concat(chunks) {
  const total = chunks.reduce((n, c) => n + c.length, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.length
  }
  return out
}

const golden = await readJson(GOLDEN_PATH)

console.log(`=== p3-flowenc-test @ ${IS_TJS ? 'tjs' : 'node'} ===`)

// 1. 密码派生出口
for (const encType of ['aesctr', 'chacha20']) {
  for (const sizeSalt of SIZE_SALTS) {
    const fe = new FlowEnc(PASSWORD, encType, sizeSalt)
    const dKey = `${encType}-${sizeSalt}`
    const expect = golden.derive[dKey]
    report(`derive passwdOutward ${dKey}`, fe.passwdOutward === expect.passwdOutward)
    report(`derive key ${dKey}`, toHex(fe.key) === expect.key)
  }
  const stat = FlowEnc.getPassWdOutward(PASSWORD, encType)
  report(`getPassWdOutward ${encType}`, stat === golden.derive[`${encType}-0`].passwdOutward)
}

// 2. 全量加密出口 + 3. 流式 transform + 4. seek
for (const encType of ['aesctr', 'chacha20']) {
  for (const sizeSalt of SIZE_SALTS) {
    for (const len of CIPHER_LENS) {
      const vKey = `${encType}-${sizeSalt}-${len}`
      const expectCt = golden.ciphertext[vKey]
      if (!expectCt) {
        report(`cipher ${vKey}`, false, 'golden 缺失')
        continue
      }
      const plain = makePlaintext(len)
      const fe = new FlowEnc(PASSWORD, encType, sizeSalt)
      const full = fe.encryptFlow.encrypt(plain)
      report(`cipher ${vKey}`, toHex(full) === expectCt)

      const fe2 = new FlowEnc(PASSWORD, encType, sizeSalt)
      const streamed = await collectTransform(fe2.encryptTransform(), plain)
      report(`transform ${vKey}`, toHex(streamed) === expectCt)

      const ctBytes = hexToBytes(expectCt)
      const fe3 = new FlowEnc(PASSWORD, encType, sizeSalt)
      await fe3.setPosition(SEEK_POS)
      const seg = fe3.encryptFlow.decrypt(ctBytes.subarray(SEEK_POS))
      report(`seek ${vKey}`, toHex(seg) === toHex(plain.subarray(SEEK_POS)))
    }
  }
}

// 5. 名字链路
const nameGolden = await readJsonOptional(NAME_GOLDEN_PATH)
if (RECORD) {
  const vectors = {}
  for (const encType of ['aesctr', 'chacha20']) {
    vectors[encType] = NAME_SAMPLES.map((name) => ({
      plain: name,
      encoded: encodeName(PASSWORD, encType, name),
    }))
  }
  await writeJson(NAME_GOLDEN_PATH, vectors)
  console.log('已录制名字向量 → test/p3-name-golden.json')
} else if (nameGolden) {
  for (const encType of ['aesctr', 'chacha20']) {
    for (const item of nameGolden[encType]) {
      const encoded = encodeName(PASSWORD, encType, item.plain)
      report(`name enc ${encType} ${item.plain.slice(0, 12)}`, encoded === item.encoded)
      const decoded = decodeName(PASSWORD, encType, item.encoded)
      report(`name dec ${encType} ${item.plain.slice(0, 12)}`, decoded === item.plain)
    }
  }
} else {
  // 无录制向量时仅做往返自检
  for (const encType of ['aesctr', 'chacha20']) {
    for (const name of NAME_SAMPLES) {
      const decoded = decodeName(PASSWORD, encType, encodeName(PASSWORD, encType, name))
      report(`name roundtrip ${encType}`, decoded === name)
    }
  }
}

// 6. rc4：tjs 显式拒绝（node 行为不变不测）
if (IS_TJS) {
  let threw = false
  try {
    new FlowEnc(PASSWORD, 'rc4', 1)
  } catch {
    threw = true
  }
  report('rc4 tjs 显式拒绝', threw)
  const { probeChacha20Backends } = await import('../src/utils/chacha20.tjs.js')
  const backends = probeChacha20Backends()
  console.log(`chacha20 后端: ${backends.map((b) => b.name + '(' + b.detail + ')').join(', ') || 'js-fallback'}`)
}

console.log(`--- ${pass} pass, ${fail} fail ---`)
if (fail > 0) {
  console.log(failures.join('\n'))
}
// node 侧导入链（rc4Md5→PRGAThread）持有事件循环句柄，显式退出
if (!IS_TJS) process.exit(fail > 0 ? 1 : 0)
if (fail > 0) throw new Error(`p3-flowenc-test 失败 ${fail} 项`)
