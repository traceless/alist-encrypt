/**
 * 金样测试：Node 与 tjs 密文逐字节等价（双运行时安全网）
 *
 * 目标（迁移计划前置项 2）：P3 加密分发改造期间，任何实现变更必须保证
 * 双端密文逐字节一致 —— 本脚本以 Node 生产源码（src/utils/aesCTR.js、
 * chacha20.js）录制的 golden 向量为基准，tjs 端（P3 形态实现：subtle
 * PBKDF2 + tjs:hashing + subtle AES-CTR 分块 + ChaCha20 纯 JS/FFI）逐字节比对。
 *
 * 覆盖面（rc4/mix 按用户决策不测不迁移）：
 *   1. 派生链：aesctr（pbkdf2 'AES-CTR' → passwdOutward/key/iv）与
 *      chacha20（pbkdf2 'CHA20' → passwdOutward/key/nonce），双 sizeSalt
 *   2. aesctr 密文：全量加密 + 任意长度 + 流式分块拼接 == 全量 + seek 解密段
 *   3. chacha20 密文：全量 + 奇数长度连续 update（_bufPos 部分块缓存）+ seek
 *   4. tjs 专属：FFI EVP/nettle 适配器 vs 纯 JS 交叉（musl 无 FFI 自动 SKIP）
 *
 * 运行（必须在 node-proxy 目录下）：
 *   node   test/crypto-golden-test.mjs            # 对比 golden（回归）
 *   node   test/crypto-golden-test.mjs --record   # 重录 golden（算法参数变更时）
 *   tjs-glibc run test/crypto-golden-test.mjs     # tjs 端比对（含 FFI 套件）
 *   tjs-musl   run test/crypto-golden-test.mjs    # musl 静态版（FFI 自动 SKIP）
 *
 * 红线：加密算法参数不可动（浏览器 crypto-core.js 互通），golden 变更
 * 必须能解释原因（Node 源码同步变更 or 算法参数评审通过）。
 */
'use strict'

const IS_TJS = typeof tjs !== 'undefined'
const MODE = IS_TJS ? 'tjs' : 'node'
const RECORD = !IS_TJS && process.argv.includes('--record')
const GOLDEN_PATH = 'test/crypto-golden.json'

// ---------- 确定性向量输入 ----------
const PASSWORD = '123456'
const SIZE_SALTS = [0, 1048577] // 0 与非整块 fileSize
const CIPHERTEXT_LENS = [17, 65, 4097, 65535, 131072] // 跨块/对齐/大块
const STREAM_SPLITS = [1, 63, 64, 65, 100, 4097] // 内部交叉用（不进 golden）
const SEEK_POS = 123457 // 奇数 seek（跨块 + 块内偏移）

// LCG 确定性明文（双端一致，禁止换成 getRandomValues）
function makePlaintext(len) {
  let s = 0x9e3779b9 >>> 0
  const out = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    out[i] = (s >>> 24) & 0xff
  }
  return out
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 与 src/utils/aesCTR.js 的 incrementIV 语义一致（全 128 位 4×u32 BE 进位）
function incrementIV(counter, blocks) {
  const res = new Uint8Array(counter)
  const MAX_UINT32 = 0xffffffff
  const incrementBig = ~~(blocks / MAX_UINT32)
  const incrementLittle = (blocks % MAX_UINT32) - incrementBig
  let overflow = 0
  for (let idx = 0; idx < 4; ++idx) {
    let num = res[12 - idx * 4] << 24 | res[13 - idx * 4] << 16 | res[14 - idx * 4] << 8 | res[15 - idx * 4]
    let inc = overflow
    if (idx === 0) inc += incrementLittle
    if (idx === 1) inc += incrementBig
    num += inc
    const numBig = ~~(num / MAX_UINT32)
    const numLittle = (num % MAX_UINT32) - numBig
    overflow = numBig
    const v = numLittle >>> 0
    res[12 - idx * 4] = (v >>> 24) & 0xff
    res[13 - idx * 4] = (v >>> 16) & 0xff
    res[14 - idx * 4] = (v >>> 8) & 0xff
    res[15 - idx * 4] = v & 0xff
  }
  return res
}

// ---------- 断言框架 ----------
let passCount = 0
let failCount = 0
const failures = []

function report(name, ok, detail = '') {
  if (ok) {
    passCount++
    console.log(`PASS ${name}`)
  } else {
    failCount++
    failures.push(name)
    console.log(`FAIL ${name}${detail ? '  ' + detail : ''}`)
  }
}

function firstDiff(a, b) {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return `byte#${i} got=${a[i]} want=${b[i]}`
  }
  return `length got=${a.length} want=${b.length}`
}

function assertBytes(name, got, wantHex) {
  if (typeof wantHex !== 'string') {
    report(name, false, 'golden 缺失该项（需 --record 重录）')
    return
  }
  const gotHex = toHex(got)
  if (gotHex === wantHex) {
    report(name, true)
  } else {
    const okLen = gotHex.length === wantHex.length
    report(name, false, okLen ? firstDiff(got, Uint8Array.from(wantHex.match(/.{2}/g).map((h) => parseInt(h, 16)))) : `len got=${gotHex.length / 2} want=${wantHex.length / 2}`)
  }
}

// ---------- Node 端：生产源码实现 ----------
const nodeImpl = IS_TJS
  ? null
  : {
      AesCTR: (await import('../src/utils/aesCTR.js')).default,
      ChaCha20: (await import('../src/utils/chacha20.js')).default,
    }

// Node 端 aesctr 全量加密（生产类）
function nodeAesCtrEncrypt(password, sizeSalt, plain) {
  const c = new nodeImpl.AesCTR(password, sizeSalt)
  return { ct: c.encrypt(plain), meta: { passwdOutward: c.passwdOutward, key: toHex(c.key), iv: toHex(c.soureIv) } }
}

// Node 端 chacha20 全量加密（生产类）
function nodeChaCha20Encrypt(password, sizeSalt, plain) {
  const c = new nodeImpl.ChaCha20(password, sizeSalt)
  return { ct: c.encrypt(plain), meta: { passwdOutward: c.passwdOutward, key: toHex(c.key), nonce: toHex(c.nonce) } }
}

// ---------- tjs 端：P3 形态实现 ----------
const subtle = globalThis.crypto.subtle
const enc = new TextEncoder()

async function tjsDeriveAesCtr(password, sizeSalt) {
  let passwdOutward = password
  if (password.length !== 32) {
    const km = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode('AES-CTR'), iterations: 1000, hash: 'SHA-256' },
      km,
      128,
    )
    passwdOutward = toHex(new Uint8Array(bits))
  }
  const { createHash } = await import('tjs:hashing')
  const key = createHash('md5').update(enc.encode(passwdOutward + sizeSalt)).bytes()
  const iv = createHash('md5').update(enc.encode(sizeSalt + '')).bytes()
  return { passwdOutward, key, iv }
}

async function tjsDeriveChaCha20(password, sizeSalt) {
  let passwdOutward = password
  if (password.length !== 32) {
    const km = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode('CHA20'), iterations: 1000, hash: 'SHA-256' },
      km,
      128,
    )
    passwdOutward = toHex(new Uint8Array(bits))
  }
  const { createHash } = await import('tjs:hashing')
  const key = createHash('sha256').update(enc.encode(passwdOutward + sizeSalt)).bytes()
  const nonce = createHash('md5').update(enc.encode(sizeSalt + '')).bytes().subarray(0, 12)
  return { passwdOutward, key, nonce }
}

// tjs 端 aesctr 流式实现（P3 形态）：
// subtle 无法从块中间续接 keystream，跨 update 必须缓存部分块 —— 语义对齐
// Node 单流 cipher（密钥流位置连续）；部分块 keystream 用「加密 16 字节零块」
// 提取（CTR 加密==解密，zero^ks==ks），对齐中段整块批量直调。
class TjsAesCtrStream {
  constructor(keyBytes, ivBytes) {
    this._key = keyBytes.slice()
    this._iv = ivBytes.slice()
    this._pos = 0 // 流内绝对位置（字节）
    this._ks = null // 部分块 keystream 缓存（16B）
    this._ck = null
  }
  async _ckey() {
    if (!this._ck) this._ck = await subtle.importKey('raw', this._key, 'AES-CTR', false, ['encrypt'])
    return this._ck
  }
  async update(data) {
    const out = new Uint8Array(data.length)
    let i = 0
    // 1. 部分块续传（上一段尾部残余 keystream）
    if (this._ks) {
      const off = this._pos % 16
      const n = Math.min(16 - off, data.length)
      for (let k = 0; k < n; k++) out[k] = data[k] ^ this._ks[off + k]
      this._pos += n
      i = n
      if (off + n === 16) this._ks = null
    }
    // 2. 16 对齐中段：counter 整块递增批量直调
    const mid = ((data.length - i) >> 4) << 4
    if (mid > 0) {
      const counter = incrementIV(this._iv, this._pos / 16)
      const ct = await subtle.encrypt({ name: 'AES-CTR', counter, length: 128 }, await this._ckey(), data.subarray(i, i + mid))
      out.set(new Uint8Array(ct), i)
      this._pos += mid
      i += mid
    }
    // 3. 尾部部分块：提取并缓存该块 keystream
    const tail = data.length - i
    if (tail > 0) {
      const counter = incrementIV(this._iv, this._pos / 16)
      const ks = new Uint8Array(await subtle.encrypt({ name: 'AES-CTR', counter, length: 128 }, await this._ckey(), new Uint8Array(16)))
      for (let k = 0; k < tail; k++) out[i + k] = data[i + k] ^ ks[k]
      this._ks = ks
      this._pos += tail
    }
    return out
  }
}

// 全量加密 = 流式实例单次调用（语义同一实现，杜绝双路径漂移）
async function tjsAesCtrEncrypt(keyBytes, ivBytes, plain) {
  return new TjsAesCtrStream(keyBytes, ivBytes).update(plain)
}

// tjs 端 aesctr seek 解密：从整块起点解密后裁剪（key stream 只依赖 counter，数学等价）
async function tjsAesCtrSeekDecrypt(keyBytes, ivBytes, fullCt, pos) {
  const ck = await subtle.importKey('raw', keyBytes, 'AES-CTR', false, ['decrypt'])
  const blockStart = Math.floor(pos / 16) * 16
  const counter = incrementIV(ivBytes, blockStart / 16)
  const dec = await subtle.decrypt({ name: 'AES-CTR', counter, length: 128 }, ck, fullCt.subarray(blockStart))
  return new Uint8Array(dec).subarray(pos - blockStart)
}

// tjs 端 ChaCha20 纯 JS（完整复刻 src/utils/chacha20.js 语义，含 _bufPos 跨块缓存与 256G 进位）
class RefChaCha20 {
  constructor(key, nonce, counter = 1) {
    this.skey = [...key]
    this.nonce = [...nonce]
    this.counter = counter
    this._bufPos = 0
    this._keystream = new Uint8Array(64)
  }
  _rotl(v, n) {
    return (v << n) | (v >>> (32 - n))
  }
  _qr(st, a, b, c, d) {
    st[a] = (st[a] + st[b]) >>> 0; st[d] = this._rotl(st[d] ^ st[a], 16)
    st[c] = (st[c] + st[d]) >>> 0; st[b] = this._rotl(st[b] ^ st[c], 12)
    st[a] = (st[a] + st[b]) >>> 0; st[d] = this._rotl(st[d] ^ st[a], 8)
    st[c] = (st[c] + st[d]) >>> 0; st[b] = this._rotl(st[b] ^ st[c], 7)
  }
  _bytesToUint32(buf) {
    const arr = new Uint32Array(buf.length / 4)
    for (let i = 0; i < arr.length; i++) {
      arr[i] = buf[i * 4] | (buf[i * 4 + 1] << 8) | (buf[i * 4 + 2] << 16) | (buf[i * 4 + 3] << 24)
    }
    return arr
  }
  _uint32ToBytes(u32, buf) {
    for (let i = 0; i < u32.length; i++) {
      const pos = i * 4
      buf[pos] = u32[i] & 0xff
      buf[pos + 1] = (u32[i] >>> 8) & 0xff
      buf[pos + 2] = (u32[i] >>> 16) & 0xff
      buf[pos + 3] = (u32[i] >>> 24) & 0xff
    }
  }
  _block() {
    const st = [
      0x61707865, 0x3320646e, 0x79622d32, 0x6b206574,
      ...this._bytesToUint32(this.skey),
      this.counter,
      ...this._bytesToUint32(this.nonce),
    ]
    this.counter = (this.counter + 1) >>> 0
    if (this.counter == 0) {
      const bt = this._bytesToUint32(this.nonce)
      bt[2] = (bt[2] + 1) >>> 0
      this._uint32ToBytes(bt, this.nonce)
    }
    const x = [...st]
    for (let i = 0; i < 10; i++) {
      this._qr(x, 0, 4, 8, 12)
      this._qr(x, 1, 5, 9, 13)
      this._qr(x, 2, 6, 10, 14)
      this._qr(x, 3, 7, 11, 15)
      this._qr(x, 0, 5, 10, 15)
      this._qr(x, 1, 6, 11, 12)
      this._qr(x, 2, 7, 8, 13)
      this._qr(x, 3, 4, 9, 14)
    }
    for (let i = 0; i < 16; i++) x[i] = (x[i] + st[i]) >>> 0
    this._uint32ToBytes(x, this._keystream)
    this._bufPos = 0
  }
  update(data) {
    const out = new Uint8Array(data.length)
    let pos = 0
    while (pos < data.length) {
      const len = Math.min(64, data.length - pos)
      for (let i = 0; i < len; i++) {
        if (this._bufPos % 64 === 0) this._block()
        out[pos + i] = data[pos + i] ^ this._keystream[this._bufPos++]
      }
      pos += len
    }
    return out
  }
  setPosition(position) {
    this.counter = Math.floor(position / 64) + 1
    this._bufPos = 0
    this.update(new Uint8Array(position % 64))
  }
}

// tjs 端 FFI 适配器（S5 精炼版，语义对齐 chacha20.js 按块重定位）
let dlopen = null
const FFI_CANDIDATES = {
  crypto: ['libcrypto.so.3', 'libcrypto.so.1.1'],
  nettle: ['libnettle.so.8', 'libnettle.so.7'],
}
const EVP_SYMS = {
  EVP_chacha20: { returns: 'pointer', args: [], optional: true },
  EVP_CIPHER_CTX_new: { returns: 'pointer', args: [], optional: true },
  EVP_CIPHER_CTX_free: { returns: 'void', args: ['pointer'], optional: true },
  EVP_EncryptInit_ex: { returns: 'sint32', args: ['pointer', 'pointer', 'pointer', 'buffer', 'buffer'], optional: true },
  EVP_EncryptUpdate: { returns: 'sint32', args: ['pointer', 'buffer', 'buffer', 'buffer', 'sint32'], optional: true },
}
const NETTLE_SYMS = {
  nettle_chacha_set_key: { returns: 'void', args: ['buffer', 'buffer'], optional: true },
  nettle_chacha_set_nonce96: { returns: 'void', args: ['buffer', 'buffer'], optional: true },
  nettle_chacha_set_counter32: { returns: 'void', args: ['buffer', 'buffer'], optional: true },
  nettle_chacha_crypt32: { returns: 'void', args: ['buffer', 'size_t', 'buffer', 'buffer'], optional: true },
}

function tryDlopen(candidates, syms, required) {
  for (const path of candidates) {
    let lib
    try {
      lib = dlopen(path, syms)
    } catch {
      continue
    }
    if (required.every((s) => s in lib.symbols)) return { path, lib }
    lib.close()
  }
  return null
}

function probeFfiBackends() {
  const backends = []
  const evp = tryDlopen(FFI_CANDIDATES.crypto, EVP_SYMS, [
    'EVP_chacha20', 'EVP_CIPHER_CTX_new', 'EVP_EncryptInit_ex', 'EVP_EncryptUpdate',
  ])
  if (evp) backends.push({ name: 'ffi-evp', detail: evp.path, lib: evp.lib })
  const nettle = tryDlopen(FFI_CANDIDATES.nettle, NETTLE_SYMS, [
    'nettle_chacha_set_key', 'nettle_chacha_set_nonce96', 'nettle_chacha_crypt32',
  ])
  if (nettle) backends.push({ name: 'ffi-nettle', detail: nettle.path, lib: nettle.lib })
  return backends
}

class FfiChaCha20 {
  constructor(be, key, nonce, counter = 1) {
    this.be = be
    this.key = key
    this.nonce = nonce
    this.offset = (counter - 1) * 64
    this._ks = null
    this._ksBase = -1
    this._iv = new Uint8Array(16)
    this._ivDv = new DataView(this._iv.buffer)
    this._outl = new Uint8Array(4)
    this._outlDv = new DataView(this._outl.buffer)
    this._zeros = new Uint8Array(64)
    if (be.name === 'ffi-evp') {
      const s = be.lib.symbols
      this._ctx = s.EVP_CIPHER_CTX_new()
      this._evp = s.EVP_chacha20()
      this._init = s.EVP_EncryptInit_ex
      this._update = s.EVP_EncryptUpdate
      this._free = s.EVP_CIPHER_CTX_free
    } else {
      const s = be.lib.symbols
      this._ctxBuf = new Uint8Array(64)
      this._counterBuf = new Uint8Array(4)
      this._counterDv = new DataView(this._counterBuf.buffer)
      s.nettle_chacha_set_key(this._ctxBuf, key)
      s.nettle_chacha_set_nonce96(this._ctxBuf, nonce)
      this._setCounter = (c) => {
        this._counterDv.setUint32(0, c, true)
        s.nettle_chacha_set_counter32(this._ctxBuf, this._counterBuf)
      }
      this._crypt = s.nettle_chacha_crypt32
      this._setCounter(this._blockCounter())
    }
  }
  _blockCounter() {
    return Math.floor(this.offset / 64) + 1
  }
  _seek() {
    if (this.be.name === 'ffi-evp') {
      this._ivDv.setUint32(0, this._blockCounter(), true)
      this._iv.set(this.nonce, 4)
      if (this._init(this._ctx, this._evp, null, this.key, this._iv) !== 1) throw new Error('EVP init failed')
    } else {
      this._setCounter(this._blockCounter())
    }
  }
  _cryptRaw(src, dst, len) {
    this._seek()
    if (this.be.name === 'ffi-evp') {
      if (this._update(this._ctx, dst, this._outl, src, len) !== 1) throw new Error('EVP update failed')
      if (this._outlDv.getInt32(0, true) !== len) throw new Error('EVP outl mismatch')
    } else {
      this._crypt(this._ctxBuf, len, dst, src)
    }
  }
  _keystreamAt(base) {
    if (this._ks && this._ksBase === base) return this._ks
    const ks = new Uint8Array(64)
    this._cryptRaw(this._zeros, ks, 64)
    this._ks = ks
    this._ksBase = base
    return ks
  }
  update(data) {
    const out = new Uint8Array(data.length)
    let pos = 0
    const offMod = this.offset % 64
    if (offMod !== 0) {
      let head = Math.min(64 - offMod, data.length)
      const ks = this._keystreamAt(this.offset - offMod)
      for (let i = 0; i < head; i++) out[i] = data[i] ^ ks[offMod + i]
      pos = head
      this.offset += head
    }
    const mid = (data.length - pos) & ~63
    if (mid > 0) {
      this._cryptRaw(data.subarray(pos, pos + mid), out.subarray(pos, pos + mid), mid)
      pos += mid
      this.offset += mid
    }
    const tail = data.length - pos
    if (tail > 0) {
      const base = this.offset - (this.offset % 64)
      const ks = this._keystreamAt(base)
      const off2 = this.offset % 64
      for (let i = 0; i < tail; i++) out[pos + i] = data[pos + i] ^ ks[off2 + i]
      this.offset += tail
    }
    return out
  }
  setPosition(position) {
    this.offset = position
  }
  dispose() {
    if (this.be.name === 'ffi-evp') this._free(this._ctx)
  }
}

function fatalExit(code) {
  if (typeof process !== 'undefined' && process.exit) process.exit(code)
  else tjs.exit(code)
}

// ---------- golden 读写 ----------
async function readGolden() {
  if (IS_TJS) {
    const data = await tjs.readFile(GOLDEN_PATH)
    return JSON.parse(new TextDecoder().decode(data))
  }
  const fs = (await import('node:fs')).default
  return JSON.parse(fs.readFileSync(GOLDEN_PATH, 'utf8'))
}

async function writeGolden(golden) {
  const fs = (await import('node:fs')).default
  fs.writeFileSync(GOLDEN_PATH, JSON.stringify(golden, null, 2) + '\n')
}

// ---------- golden 构造（Node 端） ----------
async function buildGolden() {
  const derive = {}
  const ciphertext = {}
  for (const salt of SIZE_SALTS) {
    const a = nodeAesCtrEncrypt(PASSWORD, salt, makePlaintext(1))
    derive[`aesctr-${salt}`] = a.meta
    const c = nodeChaCha20Encrypt(PASSWORD, salt, makePlaintext(1))
    derive[`chacha20-${salt}`] = c.meta
    for (const len of CIPHERTEXT_LENS) {
      const plain = makePlaintext(len)
      ciphertext[`aesctr-${salt}-${len}`] = toHex(nodeAesCtrEncrypt(PASSWORD, salt, plain).ct)
      ciphertext[`chacha20-${salt}-${len}`] = toHex(nodeChaCha20Encrypt(PASSWORD, salt, plain).ct)
    }
  }
  return {
    meta: {
      recorded_by: `node ${process.version}`,
      recorded_at: new Date().toISOString(),
      password: PASSWORD,
      size_salts: SIZE_SALTS,
      ciphertext_lens: CIPHERTEXT_LENS,
      seek_pos: SEEK_POS,
      note: '算法参数红线：与 src/utils/aesCTR.js、chacha20.js、浏览器 crypto-core.js 互通',
    },
    derive,
    ciphertext,
  }
}

// ---------- 套件 ----------
async function suiteNode(golden) {
  // 1. 派生链回归
  for (const salt of SIZE_SALTS) {
    const a = nodeAesCtrEncrypt(PASSWORD, salt, makePlaintext(1))
    report(`node derive aesctr-${salt}`, JSON.stringify(a.meta) === JSON.stringify(golden.derive[`aesctr-${salt}`]),
      JSON.stringify(a.meta) + ' vs ' + JSON.stringify(golden.derive[`aesctr-${salt}`]))
    const c = nodeChaCha20Encrypt(PASSWORD, salt, makePlaintext(1))
    report(`node derive chacha20-${salt}`, JSON.stringify(c.meta) === JSON.stringify(golden.derive[`chacha20-${salt}`]),
      JSON.stringify(c.meta) + ' vs ' + JSON.stringify(golden.derive[`chacha20-${salt}`]))
  }
  // 2. 全量密文回归
  for (const salt of SIZE_SALTS) {
    for (const len of CIPHERTEXT_LENS) {
      const plain = makePlaintext(len)
      assertBytes(`node ct aesctr-${salt}-${len}`, nodeAesCtrEncrypt(PASSWORD, salt, plain).ct, golden.ciphertext[`aesctr-${salt}-${len}`])
      assertBytes(`node ct chacha20-${salt}-${len}`, nodeChaCha20Encrypt(PASSWORD, salt, plain).ct, golden.ciphertext[`chacha20-${salt}-${len}`])
    }
  }
  // 3. 流式分块拼接 == 全量（内部交叉）
  for (const len of CIPHERTEXT_LENS) {
    const plain = makePlaintext(len)
    // aesctr：同实例连续 update 收集（注意 AesCTR.encrypt 直接返回 update 结果）
    const a = new nodeImpl.AesCTR(PASSWORD, 0)
    const partsA = []
    let pos = 0
    let i = 0
    while (pos < plain.length) {
      const take = Math.min(STREAM_SPLITS[i++ % STREAM_SPLITS.length], plain.length - pos)
      partsA.push(a.encrypt(plain.subarray(pos, pos + take)))
      pos += take
    }
    const aStream = new Uint8Array(len)
    partsA.forEach((p, idx) => aStream.set(p, partsA.slice(0, idx).reduce((s, x) => s + x.length, 0)))
    const aFull = nodeAesCtrEncrypt(PASSWORD, 0, plain).ct
    report(`node stream aesctr len=${len}`, toHex(aStream) === toHex(aFull), toHex(aStream) === toHex(aFull) ? '' : firstDiff(aStream, aFull))

    const ch = new nodeImpl.ChaCha20(PASSWORD, 0)
    const partsC = []
    pos = 0
    i = 0
    while (pos < plain.length) {
      const take = Math.min(STREAM_SPLITS[i++ % STREAM_SPLITS.length], plain.length - pos)
      partsC.push(ch.encrypt(plain.subarray(pos, pos + take)))
      pos += take
    }
    const chStream = new Uint8Array(len)
    partsC.forEach((p, idx) => chStream.set(p, partsC.slice(0, idx).reduce((s, x) => s + x.length, 0)))
    const chFull = nodeChaCha20Encrypt(PASSWORD, 0, plain).ct
    report(`node stream chacha20 len=${len}`, toHex(chStream) === toHex(chFull), toHex(chStream) === toHex(chFull) ? '' : firstDiff(chStream, chFull))
  }
  // 4. seek 解密段（内部交叉）
  {
    const len = 131072
    const plain = makePlaintext(len)
    const aCt = nodeAesCtrEncrypt(PASSWORD, 0, plain).ct
    const a = new nodeImpl.AesCTR(PASSWORD, 0)
    await a.setPositionAsync(SEEK_POS)
    const aSeg = a.decrypt(aCt.subarray(SEEK_POS))
    report('node seek aesctr', toHex(aSeg) === toHex(plain.subarray(SEEK_POS)), toHex(aSeg) === toHex(plain.subarray(SEEK_POS)) ? '' : firstDiff(aSeg, plain.subarray(SEEK_POS)))

    const chCt = nodeChaCha20Encrypt(PASSWORD, 0, plain).ct
    const ch = new nodeImpl.ChaCha20(PASSWORD, 0)
    await ch.setPositionAsync(SEEK_POS)
    const chSeg = ch.decrypt(chCt.subarray(SEEK_POS))
    report('node seek chacha20', toHex(chSeg) === toHex(plain.subarray(SEEK_POS)), toHex(chSeg) === toHex(plain.subarray(SEEK_POS)) ? '' : firstDiff(chSeg, plain.subarray(SEEK_POS)))
  }
  // 5. incrementIV 内嵌版与生产版对照（防金样脚本漂移）
  {
    const a = new nodeImpl.AesCTR(PASSWORD, 0)
    for (const blocks of [1, 4095, 4096, 123457]) {
      const mine = incrementIV(a.soureIv, blocks)
      const prod = { iv: a.soureIv.slice() }
      nodeImpl.AesCTR.prototype.incrementIV.call(prod, blocks)
      report(`node incrementIV blocks=${blocks}`, toHex(mine) === toHex(prod.iv), firstDiff(mine, prod.iv))
    }
  }
}

async function suiteTjs(golden) {
  // 1. 派生链
  for (const salt of SIZE_SALTS) {
    const a = await tjsDeriveAesCtr(PASSWORD, salt)
    const wantA = golden.derive[`aesctr-${salt}`]
    report(`tjs derive aesctr-${salt} passwdOutward`, a.passwdOutward === wantA?.passwdOutward, `${a.passwdOutward} vs ${wantA?.passwdOutward}`)
    report(`tjs derive aesctr-${salt} key/iv`, toHex(a.key) === wantA?.key && toHex(a.iv) === wantA?.iv,
      `key ${toHex(a.key)} vs ${wantA?.key}; iv ${toHex(a.iv)} vs ${wantA?.iv}`)
    const c = await tjsDeriveChaCha20(PASSWORD, salt)
    const wantC = golden.derive[`chacha20-${salt}`]
    report(`tjs derive chacha20-${salt}`, c.passwdOutward === wantC?.passwdOutward && toHex(c.key) === wantC?.key && toHex(c.nonce) === wantC?.nonce,
      `outward ${c.passwdOutward} vs ${wantC?.passwdOutward}; key ${toHex(c.key)} vs ${wantC?.key}; nonce ${toHex(c.nonce)} vs ${wantC?.nonce}`)
  }
  // 2. 全量密文
  const derived = {}
  for (const salt of SIZE_SALTS) {
    derived[salt] = {
      aes: await tjsDeriveAesCtr(PASSWORD, salt),
      cha: await tjsDeriveChaCha20(PASSWORD, salt),
    }
  }
  for (const salt of SIZE_SALTS) {
    for (const len of CIPHERTEXT_LENS) {
      const plain = makePlaintext(len)
      const aCt = await tjsAesCtrEncrypt(derived[salt].aes.key, derived[salt].aes.iv, plain)
      assertBytes(`tjs ct aesctr-${salt}-${len}`, aCt, golden.ciphertext[`aesctr-${salt}-${len}`])
      const ref = new RefChaCha20(derived[salt].cha.key, derived[salt].cha.nonce, 1)
      assertBytes(`tjs ct chacha20-${salt}-${len}`, ref.update(plain), golden.ciphertext[`chacha20-${salt}-${len}`])
    }
  }
  // 3. tjs 流式分块（aesctr 跨 update 部分块缓存语义；chacha 奇数长度序列）
  {
    const len = 131072
    const plain = makePlaintext(len)
    const d = derived[0]
    const aStr = new TjsAesCtrStream(d.aes.key, d.aes.iv)
    const partsA = []
    let pos = 0
    let i = 0
    while (pos < plain.length) {
      const take = Math.min(STREAM_SPLITS[i++ % STREAM_SPLITS.length], plain.length - pos)
      partsA.push(await aStr.update(plain.subarray(pos, pos + take)))
      pos += take
    }
    const aStream = new Uint8Array(len)
    partsA.forEach((p, idx) => aStream.set(p, partsA.slice(0, idx).reduce((s, x) => s + x.length, 0)))
    assertBytes(`tjs stream aesctr-0-${len}`, aStream, golden.ciphertext[`aesctr-0-${len}`])

    const ref = new RefChaCha20(d.cha.key, d.cha.nonce, 1)
    const partsC = []
    pos = 0
    i = 0
    while (pos < plain.length) {
      const take = Math.min(STREAM_SPLITS[i++ % STREAM_SPLITS.length], plain.length - pos)
      partsC.push(ref.update(plain.subarray(pos, pos + take)))
      pos += take
    }
    const cStream = new Uint8Array(len)
    partsC.forEach((p, idx) => cStream.set(p, partsC.slice(0, idx).reduce((s, x) => s + x.length, 0)))
    assertBytes(`tjs stream chacha20-0-${len}`, cStream, golden.ciphertext[`chacha20-0-${len}`])
  }
  // 4. seek 解密段
  {
    const len = 131072
    const plain = makePlaintext(len)
    const d = derived[0]
    const aCt = await tjsAesCtrEncrypt(d.aes.key, d.aes.iv, plain)
    const aSeg = await tjsAesCtrSeekDecrypt(d.aes.key, d.aes.iv, aCt, SEEK_POS)
    report(`tjs seek aesctr pos=${SEEK_POS}`, toHex(aSeg) === toHex(plain.subarray(SEEK_POS)), firstDiff(aSeg, plain.subarray(SEEK_POS)))

    const chCt = new RefChaCha20(d.cha.key, d.cha.nonce, 1).update(plain)
    const ch = new RefChaCha20(d.cha.key, d.cha.nonce, 1)
    ch.setPosition(SEEK_POS)
    const chSeg = ch.update(chCt.subarray(SEEK_POS))
    report(`tjs seek chacha20 pos=${SEEK_POS}`, toHex(chSeg) === toHex(plain.subarray(SEEK_POS)), firstDiff(chSeg, plain.subarray(SEEK_POS)))
  }
  // 5. FFI 后端 vs golden + vs 纯 JS 交叉
  let backends = []
  try {
    ;({ dlopen } = await import('tjs:ffi'))
    backends = probeFfiBackends()
  } catch {
    console.log('SKIP tjs:ffi 不可用（预期：musl 静态构建）')
  }
  if (backends.length === 0) {
    console.log('SKIP FFI 套件（无可用后端，纯 JS 已覆盖）')
  } else {
    console.log('FFI 后端: ' + backends.map((b) => `${b.name}<-${b.detail}`).join(', '))
    const salt = 0
    const d = derived[salt]
    for (const len of CIPHERTEXT_LENS) {
      const plain = makePlaintext(len)
      const refOut = new RefChaCha20(d.cha.key, d.cha.nonce, 1).update(plain)
      for (const be of backends) {
        const impl = new FfiChaCha20(be, d.cha.key, d.cha.nonce, 1)
        const out = impl.update(plain)
        assertBytes(`tjs ffi ${be.name} chacha20-${salt}-${len}`, out, golden.ciphertext[`chacha20-${salt}-${len}`])
        report(`tjs ffi-cross ${be.name} vs ref len=${len}`, toHex(out) === toHex(refOut), firstDiff(out, refOut))
        impl.dispose()
      }
    }
    // FFI seek
    {
      const len = 131072
      const plain = makePlaintext(len)
      const ct = new RefChaCha20(d.cha.key, d.cha.nonce, 1).update(plain)
      for (const be of backends) {
        const impl = new FfiChaCha20(be, d.cha.key, d.cha.nonce, 1)
        impl.setPosition(SEEK_POS)
        const seg = impl.update(ct.subarray(SEEK_POS))
        report(`tjs ffi-seek ${be.name}`, toHex(seg) === toHex(plain.subarray(SEEK_POS)), firstDiff(seg, plain.subarray(SEEK_POS)))
        impl.dispose()
      }
    }
  }
}

// ---------- 主流程 ----------
async function main() {
  console.log(`=== crypto-golden-test @ ${MODE}${RECORD ? ' (--record)' : ''} ===`)
  if (RECORD) {
    const golden = await buildGolden()
    await writeGolden(golden)
    console.log(`golden 已录制 → ${GOLDEN_PATH}`)
    // 录制后立刻跑回归确认自洽
  }
  let golden
  try {
    golden = await readGolden()
  } catch (e) {
    console.log(`FATAL golden 读取失败: ${e.message}（node 端先 --record 生成）`)
    fatalExit(1)
    return
  }
  if (IS_TJS) {
    await suiteTjs(golden)
  } else {
    await suiteNode(golden)
  }
  console.log(`\n===== 汇总: PASS=${passCount} FAIL=${failCount} =====`)
  if (failCount > 0) {
    console.log('失败项: ' + failures.join(', '))
    fatalExit(1)
  }
  console.log('=== GOLDEN OK ===')
}

main()
