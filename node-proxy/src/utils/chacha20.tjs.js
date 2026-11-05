/**
 * tjs 版 ChaCha20 实现（P3 加密分发）—— 语义逐字节对齐 src/utils/chacha20.js（金样锁定）
 *
 * 分层策略（S5 结论）：
 *   libcrypto EVP_chacha20（首选，~978MB/s）→ libnettle chacha_crypt32（~167MB/s）
 *   → 纯 JS RefChaCha20（兜底；musl 静态 tjs 的常态路径）
 * FFI 适配器按「块」重定位：EVP/nettle 每次 crypt 丢弃部分块尾部 keystream，
 * 而 chacha20.js 跨 update 缓存 _bufPos —— 非对齐头/尾用 JS 侧 keystream 块异或，
 * 64 对齐中段原生直通（零拷贝视图），每次原生调用前重新定位。
 *
 * nettle 3.10 API 三坑（段错误教训）：符号带 nettle_ 前缀；set_key 已去 length 参数；
 * set_counter32 接 4 字节缓冲指针。旧版 <3.10 走纯 JS 兜底（不探测 legacy 分支）。
 * 256G counter 进位 edge case 不处理（EVP/nettle 与项目 nonce[2]++ 行为天然不一致）。
 *
 * 派生链（红线）：passwdOutward = pbkdf2Sync(password,'CHA20',1000,16,'sha256').hex
 * （32 位密码跳过）；key = sha256(passwdOutward+sizeSalt) 32B；nonce = md5(sizeSalt) 前 12B。
 * counter 从 1 起，与 EVP IV16B=LE32(counter)+nonce12B 直接对齐。
 */
import { createHash, pbkdf2Sync } from '../runtime/cryptox.js'

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ======================= 纯 JS 内核（完整复刻 chacha20.js 语义） =======================
export class RefChaCha20 {
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
    st[a] = (st[a] + st[b]) >>> 0
    st[d] = this._rotl(st[d] ^ st[a], 16)
    st[c] = (st[c] + st[d]) >>> 0
    st[b] = this._rotl(st[b] ^ st[c], 12)
    st[a] = (st[a] + st[b]) >>> 0
    st[d] = this._rotl(st[d] ^ st[a], 8)
    st[c] = (st[c] + st[d]) >>> 0
    st[b] = this._rotl(st[b] ^ st[c], 7)
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
    const st = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574, ...this._bytesToUint32(this.skey), this.counter, ...this._bytesToUint32(this.nonce)]
    this.counter = (this.counter + 1) >>> 0
    if (this.counter == 0) {
      // 达到256G，进位到 nonce[2]
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

// ======================= FFI 适配器（glibc tjs 专享，musl 自动降级纯 JS） =======================
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
const CRYPTO_CANDIDATES = ['libcrypto.so.3', 'libcrypto.so.1.1']
const NETTLE_CANDIDATES = ['libnettle.so.8', 'libnettle.so.7']

function tryDlopen(dlopen, candidates, syms, required) {
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

// FFI 后端探测（模块顶层一次，构造期同步取用；失败静默降级纯 JS）
let probedBackends = []
try {
  const { dlopen } = await import('tjs:ffi')
  const evp = tryDlopen(dlopen, CRYPTO_CANDIDATES, EVP_SYMS, ['EVP_chacha20', 'EVP_CIPHER_CTX_new', 'EVP_EncryptInit_ex', 'EVP_EncryptUpdate'])
  if (evp) probedBackends.push({ name: 'ffi-evp', detail: evp.path, lib: evp.lib })
  const nettle = tryDlopen(dlopen, NETTLE_CANDIDATES, NETTLE_SYMS, ['nettle_chacha_set_key', 'nettle_chacha_set_nonce96', 'nettle_chacha_crypt32'])
  if (nettle) probedBackends.push({ name: 'ffi-nettle', detail: nettle.path, lib: nettle.lib })
} catch {
  // tjs:ffi 不可用（musl 静态构建）→ 纯 JS 兜底
}

export function probeChacha20Backends() {
  return probedBackends
}

class FfiChaCha20 {
  constructor(be, key, nonce, counter = 1) {
    this.be = be
    this.key = key
    this.nonce = nonce
    this.offset = (counter - 1) * 64 // 流内偏移（counter 换算基址）
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
    // 1. 非对齐头部：keystream 块 + JS 异或（< 64B）
    const offMod = this.offset % 64
    if (offMod !== 0) {
      const head = Math.min(64 - offMod, data.length)
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

// ======================= flowEnc 面向的 TjsChaCha20 =======================
export default class TjsChaCha20 {
  constructor(password, sizeSalt) {
    sizeSalt = sizeSalt + ''
    this.passwdOutward = password
    if (password.length !== 32) {
      this.passwdOutward = toHex(pbkdf2Sync(password, 'CHA20', 1000, 16, 'sha256'))
    }
    this.key = createHash('sha256')
      .update(this.passwdOutward + sizeSalt)
      .digest()
    const nonce = createHash('md5').update(sizeSalt).digest().subarray(0, 12)
    const be = probedBackends[0] || null
    this._backendName = be ? be.name : 'js-fallback'
    this._core = be ? new FfiChaCha20(be, this.key, nonce, 1) : new RefChaCha20(this.key, nonce, 1)
  }
  // 同步路径（名字加解密；XOR 流加密==解密）
  encrypt(data) {
    return this._core.update(data)
  }
  decrypt(data) {
    return this._core.update(data)
  }
  // 流路径（FFI/纯 JS 均为同步）
  encryptStream(data) {
    return this._core.update(data)
  }
  decryptStream(data) {
    return this._core.update(data)
  }
  async setPositionAsync(position) {
    this._core.setPosition(position)
  }
}
