/**
 * S5 tjs:ffi 加密内核验证（系统 libcrypto EVP / libnettle，缺失时纯 JS 兜底）
 *
 * 双二进制背景：musl 全静态 tjs 无法 dlopen（musl 硬限制），FFI 路径仅存在于
 * glibc 动态版 tjs；本脚本在任何 tjs 下都可运行，自动探测并降级：
 *   libcrypto EVP_chacha20 → libnettle chacha_crypt32/chacha20_crypt → 纯 JS
 *
 * 验证目标：
 *   1. 正确性：FFI 后端 vs RefChaCha20（完整复刻 chacha20.js 语义）逐字节一致
 *      覆盖：基础流、奇数长度连续 update（部分块语义）、seek 定位、往返
 *   2. 吞吐：64KB 分块（代理主路径）与 4KB 分块（最坏情况），JS 参考对照
 *
 * 运行：tjs run bench/ffi-crypto-bench.mjs
 *
 * 适配器语义（对齐 chacha20.js）：
 *   - 项目实现跨 update 缓存 64B keystream 残余（_bufPos），而 EVP/nettle 每次
 *     crypt 调用会丢弃部分块尾部的 keystream —— 适配器按「块」重定位：
 *     非对齐头部/尾部用 JS 侧提取的 keystream 块异或，64 对齐中段直调原生
 *   - EVP 每次原生调用前全量 EncryptInit（IV16B = LE32(counter) + nonce12B，
 *     counter 从 1 起，与项目语义直接对齐）
 *   - nettle 3.10+ 用 chacha_set_counter32；旧版回退直接写 ctx.state[15]（偏移 60）
 *   - 256G counter 进位 edge case 不处理（与 EVP/nettle 一致，项目自身为 nonce[2]++）
 */
'use strict'

import { dlopen } from 'tjs:ffi'

const perf = globalThis.performance

function fillRandom(bytes) {
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

function throughput(mb, ms) {
  return ((mb * 1024 * 1024) / (ms / 1000) / (1024 * 1024)).toFixed(1)
}

// ---------- JS 参考实现（完整复刻 src/utils/chacha20.js） ----------
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
    const arr = []
    for (let i = 0; i < buf.length / 4; i++) {
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

// ---------- 后端探测 ----------
const CRYPTO_CANDIDATES = [
  'libcrypto.so.3',
  'libcrypto.so.1.1',
  '/usr/lib/x86_64-linux-gnu/libcrypto.so.3',
  '/usr/lib/x86_64-linux-gnu/libcrypto.so.1.1',
  '/lib/x86_64-linux-gnu/libcrypto.so.3',
]
const NETTLE_CANDIDATES = [
  'libnettle.so.8',
  'libnettle.so.7',
  '/usr/lib/x86_64-linux-gnu/libnettle.so.8',
  '/usr/lib/x86_64-linux-gnu/libnettle.so.7',
  '/lib/x86_64-linux-gnu/libnettle.so.8',
]

// EVP 符号（OpenSSL 1.0.2 无 EVP_chacha20，optional 探测自动跳过）
const EVP_SYMS = {
  EVP_chacha20: { returns: 'pointer', args: [], optional: true },
  EVP_CIPHER_CTX_new: { returns: 'pointer', args: [], optional: true },
  EVP_CIPHER_CTX_free: { returns: 'void', args: ['pointer'], optional: true },
  EVP_EncryptInit_ex: { returns: 'sint32', args: ['pointer', 'pointer', 'pointer', 'buffer', 'buffer'], optional: true },
  EVP_EncryptUpdate: { returns: 'sint32', args: ['pointer', 'buffer', 'buffer', 'buffer', 'sint32'], optional: true },
}
// nettle 符号：导出名带 nettle_ 前缀（头文件 #define 去前缀）
// 3.10+ 新 API：set_key 去 length 参数、counter32 接 4B 缓冲指针（state 布局 = RFC8439，已实测）
// 旧版（<3.10，chacha20_*）：set_key 带 length、counter 直写 state[15]（偏移 60，本机无旧版未实测）
const NETTLE_SYMS = {
  nettle_chacha_set_key: { returns: 'void', args: ['buffer', 'buffer'], optional: true },
  nettle_chacha_set_nonce96: { returns: 'void', args: ['buffer', 'buffer'], optional: true },
  nettle_chacha_set_counter32: { returns: 'void', args: ['buffer', 'buffer'], optional: true },
  nettle_chacha_crypt32: { returns: 'void', args: ['buffer', 'size_t', 'buffer', 'buffer'], optional: true },
  nettle_chacha20_set_key: { returns: 'void', args: ['buffer', 'size_t', 'buffer'], optional: true },
  nettle_chacha20_set_nonce96: { returns: 'void', args: ['buffer', 'buffer'], optional: true },
  nettle_chacha20_crypt: { returns: 'void', args: ['buffer', 'size_t', 'buffer', 'buffer'], optional: true },
}

function tryDlopen(candidates, syms, required) {
  for (const path of candidates) {
    let lib
    try {
      lib = dlopen(path, syms)
    } catch {
      continue
    }
    const ok = required.every((s) => s in lib.symbols)
    if (ok) return { path, lib }
    lib.close()
  }
  return null
}

function probeBackends() {
  const backends = []
  const evp = tryDlopen(CRYPTO_CANDIDATES, EVP_SYMS, [
    'EVP_chacha20', 'EVP_CIPHER_CTX_new', 'EVP_EncryptInit_ex', 'EVP_EncryptUpdate',
  ])
  if (evp) backends.push({ name: 'ffi-evp', detail: evp.path, lib: evp.lib })
  const nettle = tryDlopen(NETTLE_CANDIDATES, NETTLE_SYMS, ['nettle_chacha_set_key', 'nettle_chacha_set_nonce96', 'nettle_chacha_crypt32'])
  const nettleOld = nettle ? null : tryDlopen(NETTLE_CANDIDATES, NETTLE_SYMS, ['nettle_chacha20_set_key', 'nettle_chacha20_set_nonce96', 'nettle_chacha20_crypt'])
  if (nettle) backends.push({ name: 'ffi-nettle', detail: nettle.path, lib: nettle.lib })
  if (nettleOld) backends.push({ name: 'ffi-nettle-legacy', detail: nettleOld.path, lib: nettleOld.lib })
  return backends
}

// ---------- FFI 适配器（EVP / nettle 双实现，语义对齐 chacha20.js） ----------
class FfiChaCha20 {
  /**
   * @param {object} be probeBackends() 的一个元素
   * @param {Uint8Array} key 32B
   * @param {Uint8Array} nonce 12B
   * @param {number} counter 起始块计数（项目语义从 1 起）
   */
  constructor(be, key, nonce, counter = 1) {
    this.be = be
    this.key = key
    this.nonce = nonce
    this.offset = (counter - 1) * 64 // 流内偏移（set_counter32 用块号换算）
    this._ks = null // 缓存的 keystream 块
    this._ksBase = -1 // 该块对应流偏移（64 对齐基址）
    this._iv = new Uint8Array(16)
    this._ivDv = new DataView(this._iv.buffer)
    this._outl = new Uint8Array(4)
    this._outlDv = new DataView(this._outl.buffer)
    this._zeros = new Uint8Array(64)

    if (be.name === 'ffi-evp') {
      const s = be.lib.symbols
      this._ctx = s.EVP_CIPHER_CTX_new()
      if (this._ctx.isNull) throw new Error('EVP_CIPHER_CTX_new failed')
      this._evp = s.EVP_chacha20()
      this._init = s.EVP_EncryptInit_ex
      this._update = s.EVP_EncryptUpdate
      this._free = s.EVP_CIPHER_CTX_free
    } else if (be.name === 'ffi-nettle') {
      const s = be.lib.symbols
      this._ctxBuf = new Uint8Array(64) // struct chacha_ctx = uint32 state[16]
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
    } else if (be.name === 'ffi-nettle-legacy') {
      const s = be.lib.symbols
      this._ctxBuf = new Uint8Array(64)
      s.nettle_chacha20_set_key(this._ctxBuf, 32, key)
      s.nettle_chacha20_set_nonce96(this._ctxBuf, nonce)
      this._setCounter = (c) => new DataView(this._ctxBuf.buffer).setUint32(60, c, true)
      this._crypt = s.nettle_chacha20_crypt
      this._setCounter(this._blockCounter())
    } else {
      throw new Error('unknown backend ' + be.name)
    }
  }

  _blockCounter() {
    return Math.floor(this.offset / 64) + 1
  }

  // EVP：全量 re-init（IV 携带块计数）；nettle：写 state[15]
  _seek() {
    if (this.be.name === 'ffi-evp') {
      this._ivDv.setUint32(0, this._blockCounter(), true)
      this._iv.set(this.nonce, 4)
      if (this._init(this._ctx, this._evp, null, this.key, this._iv) !== 1) {
        throw new Error('EVP_EncryptInit_ex failed')
      }
    } else {
      this._setCounter(this._blockCounter())
    }
  }

  // 原生 crypt 一次（src/dst 均为视图/缓冲），调用前总是重新定位
  _cryptRaw(src, dst, len) {
    this._seek()
    if (this.be.name === 'ffi-evp') {
      if (this._update(this._ctx, dst, this._outl, src, len) !== 1) {
        throw new Error('EVP_EncryptUpdate failed')
      }
      if (this._outlDv.getInt32(0, true) !== len) {
        throw new Error(`EVP outl ${this._outlDv.getInt32(0, true)} != ${len}`)
      }
    } else {
      this._crypt(this._ctxBuf, len, dst, src)
    }
  }

  // 提取指定 64 对齐基址的 keystream 块（crypt 64 个零字节）
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
    // 1. 非对齐头部：keystream 块 + JS 异或（< 64B）
    const offMod = this.offset % 64
    if (offMod !== 0) {
      let head = 64 - offMod
      if (head > data.length) head = data.length
      const ks = this._keystreamAt(this.offset - offMod)
      for (let i = 0; i < head; i++) out[i] = data[i] ^ ks[offMod + i]
      pos = head
      this.offset += head
    }
    // 2. 64 对齐中段：原生直通（零拷贝视图）
    const mid = (data.length - pos) & ~63
    if (mid > 0) {
      this._cryptRaw(data.subarray(pos, pos + mid), out.subarray(pos, pos + mid), mid)
      pos += mid
      this.offset += mid
    }
    // 3. 尾部：keystream 块 + JS 异或（< 64B）
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

// 纯 JS 兜底（无 FFI 时直接用参考实现；生产适配层同构）
class JsChaCha20 {
  constructor(_be, key, nonce, counter = 1) {
    this._ref = new RefChaCha20(key, nonce, counter)
  }
  update(data) {
    return this._ref.update(data)
  }
  setPosition(p) {
    this._ref.setPosition(p)
  }
  dispose() {}
}

// ---------- 工具 ----------
function assertEq(a, b, label) {
  if (a.length !== b.length) throw new Error(`${label}: length ${a.length} != ${b.length}`)
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) throw new Error(`${label}: byte ${i} ${a[i]} != ${b[i]}`)
  }
}

// ---------- 单后端：正确性 + 吞吐 ----------
function backendSuite(be) {
  const Impl = be ? FfiChaCha20 : JsChaCha20
  const label = be ? `${be.name} (${be.detail})` : 'js-fallback (纯 JS)'
  const r = [`--- ${label} ---`]
  const pass = (n) => {
    r.push(`PASS ${n}`)
    console.log(`PASS ${n}`)
  }

  const key = fillRandom(new Uint8Array(32))
  const nonce = fillRandom(new Uint8Array(12))

  // 1. 基础流：counter=1 连续 64KB × 8
  {
    const ref = new RefChaCha20(key, nonce, 1)
    const impl = new Impl(be, key, nonce, 1)
    const chunk = fillRandom(new Uint8Array(64 * 1024))
    for (let i = 0; i < 8; i++) {
      assertEq(impl.update(chunk), ref.update(chunk), `${label} basic chunk${i}`)
    }
    impl.dispose()
    pass('basic (8×64KB 连续流)')
  }

  // 2. 奇数长度连续 update（部分块 keystream 缓存语义）
  {
    const ref = new RefChaCha20(key, nonce, 1)
    const impl = new Impl(be, key, nonce, 1)
    for (const sz of [1, 63, 64, 65, 127, 4097, 65535]) {
      const data = fillRandom(new Uint8Array(sz))
      assertEq(impl.update(data), ref.update(data), `${label} odd size=${sz}`)
    }
    impl.dispose()
    pass('odd-sizes (1/63/64/65/127/4097/65535 连续)')
  }

  // 3. seek 定位后继续
  {
    const POS = 123457
    const ref = new RefChaCha20(key, nonce, 1)
    ref.setPosition(POS)
    const impl = new Impl(be, key, nonce, 1)
    impl.setPosition(POS)
    const chunk = fillRandom(new Uint8Array(64 * 1024))
    for (let i = 0; i < 4; i++) {
      assertEq(impl.update(chunk), ref.update(chunk), `${label} seek chunk${i}`)
    }
    impl.dispose()
    pass('seek (position=123457 后 4×64KB)')
  }

  // 4. 往返
  {
    const data = fillRandom(new Uint8Array(64 * 1024))
    const enc = new Impl(be, key, nonce, 1).update(data)
    const dec = new Impl(be, key, nonce, 1).update(enc)
    assertEq(dec, data, `${label} roundtrip`)
    pass('roundtrip')
  }

  // 5. 吞吐
  const chunk = fillRandom(new Uint8Array(64 * 1024))
  const impl = new Impl(be, key, nonce, 1)
  let processed = 0
  const total = be ? 256 * 1024 * 1024 : 16 * 1024 * 1024
  const t0 = perf.now()
  while (processed < total) {
    impl.update(chunk)
    processed += chunk.length
  }
  r.push(`throughput(${total >> 20}MB/64KB): ${throughput(total >> 20, perf.now() - t0)} MB/s`)

  const small = fillRandom(new Uint8Array(4096))
  let p2 = 0
  const total2 = be ? 64 * 1024 * 1024 : 8 * 1024 * 1024
  const t2 = perf.now()
  while (p2 < total2) {
    impl.update(small)
    p2 += small.length
  }
  r.push(`throughput(${total2 >> 20}MB/4KB): ${throughput(total2 >> 20, perf.now() - t2)} MB/s`)
  impl.dispose()
  return r
}

// ---------- 主流程 ----------
async function main() {
  console.log(`=== ffi-crypto-bench @ tjs ${tjs.engine?.versions?.quickjs || '?'} ===`)
  const backends = probeBackends()
  if (backends.length === 0) {
    console.log('无可用 FFI 后端（musl 静态或系统无 libcrypto/libnettle）→ 纯 JS 兜底')
  } else {
    console.log('探测到后端: ' + backends.map((b) => `${b.name}<-${b.detail}`).join(', '))
  }

  // 各 FFI 后端完整测试
  const outputs = []
  for (const be of backends) {
    outputs.push(backendSuite(be))
  }
  // 无后端或需要对照时跑纯 JS
  outputs.push(backendSuite(null))

  // 后端间交叉一致性（getRandomValues 单次上限 65536B，用 65535 奇数长度顺带覆盖跨界）
  if (backends.length >= 2) {
    const key = fillRandom(new Uint8Array(32))
    const nonce = fillRandom(new Uint8Array(12))
    const data = fillRandom(new Uint8Array(65535))
    const outs = backends.map((be) => new FfiChaCha20(be, key, nonce, 1).update(data))
    for (let i = 1; i < outs.length; i++) {
      assertEq(outs[i], outs[0], `cross ${backends[i].name} vs ${backends[0].name}`)
    }
    console.log('PASS cross-backend 一致性 (' + backends.map((b) => b.name).join(' == ') + ')')
    outputs.push(['PASS cross-backend 一致性'])
  }

  console.log('\n===== 汇总 =====')
  for (const lines of outputs) console.log(lines.join('\n'))
  console.log('=== DONE ===')
}

main()
