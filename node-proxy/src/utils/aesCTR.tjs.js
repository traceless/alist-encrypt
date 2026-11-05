/**
 * tjs 版 AES-CTR 实现（P3 加密分发）—— 语义逐字节对齐 src/utils/aesCTR.js（金样锁定）
 *
 * 双路径设计（tjs subtle 无同步 AES，纯 JS 无大流量吞吐）：
 *   - 同步路径 encrypt()/decrypt()：纯 JS AES-128-CTR（名字加解密/小缓冲，
 *     encodeName/decodeName 的同步调用链专用，性能无关紧要）
 *   - 流路径 encryptStream()/decryptStream()：subtle AES-CTR 批量（文件流，
 *     WebCrypto subtle 无法从 16B 块中间续接 keystream，跨 update 缓存部分块 ——
 *     16 对齐中段批量直调，头/尾用「加密 16 字节零块」提取 keystream 异或）
 *   - setPositionAsync(position)：等价 node 重置 cipher 为 floor(pos/16) 块
 *     计数器 + 消耗 pos%16 偏移，本实现为重置流位置（keystream 只依赖 counter）
 *
 * 派生链（红线，与 aesCTR.js/浏览器 crypto-core.js 互通）：
 *   passwdOutward = pbkdf2Sync(password, 'AES-CTR', 1000, 16, 'sha256').hex（32 位密码跳过）
 *   key = md5(passwdOutward + sizeSalt) 16B，iv = md5(sizeSalt) 16B
 */
import { createHash, pbkdf2Sync } from '../runtime/cryptox.js'

const subtle = globalThis.crypto.subtle

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// 与 src/utils/aesCTR.js incrementIV 语义一致（全 128 位 4×u32 BE 进位）
export function incrementIV(counter, blocks) {
  const res = new Uint8Array(counter)
  const MAX_UINT32 = 0xffffffff
  const incrementBig = ~~(blocks / MAX_UINT32)
  const incrementLittle = (blocks % MAX_UINT32) - incrementBig
  let overflow = 0
  for (let idx = 0; idx < 4; ++idx) {
    let num = (res[12 - idx * 4] << 24) | (res[13 - idx * 4] << 16) | (res[14 - idx * 4] << 8) | res[15 - idx * 4]
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

// ======================= 纯 JS AES-128 块加密（同步路径内核） =======================

const SBOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76, 0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0,
  0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0, 0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75, 0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0,
  0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84, 0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8, 0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5,
  0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2, 0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb, 0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c,
  0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79, 0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a, 0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e,
  0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e, 0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16,
])

function xtime(x) {
  return ((x << 1) ^ ((x >> 7) * 0x1b)) & 0xff
}

// AES-128 密钥扩展：11 组轮密钥（176B）
function expandKey(key) {
  const rk = new Uint8Array(176)
  rk.set(key)
  let rcon = 1
  for (let i = 16; i < 176; i += 4) {
    let t0 = rk[i - 4]
    let t1 = rk[i - 3]
    let t2 = rk[i - 2]
    let t3 = rk[i - 1]
    if (i % 16 === 0) {
      const tmp = t0 // RotWord：[t0,t1,t2,t3] → [t1,t2,t3,t0]
      t0 = SBOX[t1] ^ rcon
      t1 = SBOX[t2]
      t2 = SBOX[t3]
      t3 = SBOX[tmp]
      rcon = xtime(rcon)
    }
    rk[i] = rk[i - 16] ^ t0
    rk[i + 1] = rk[i - 15] ^ t1
    rk[i + 2] = rk[i - 14] ^ t2
    rk[i + 3] = rk[i - 13] ^ t3
  }
  return rk
}

// FIPS-197 块加密（state 索引 = r + 4c 列主序）
function encryptBlock(rk, input, output) {
  const s = new Uint8Array(16)
  for (let i = 0; i < 16; i++) s[i] = input[i] ^ rk[i]
  for (let round = 1; round <= 10; round++) {
    // SubBytes + ShiftRows（行 r 左移 r）
    const t = new Uint8Array(16)
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        t[r + 4 * c] = SBOX[s[r + 4 * ((c + r) % 4)]]
      }
    }
    if (round < 10) {
      // MixColumns（末轮跳过）
      for (let c = 0; c < 4; c++) {
        const a0 = t[4 * c]
        const a1 = t[4 * c + 1]
        const a2 = t[4 * c + 2]
        const a3 = t[4 * c + 3]
        t[4 * c] = xtime(a0) ^ xtime(a1) ^ a1 ^ a2 ^ a3
        t[4 * c + 1] = a0 ^ xtime(a1) ^ xtime(a2) ^ a2 ^ a3
        t[4 * c + 2] = a0 ^ a1 ^ xtime(a2) ^ xtime(a3) ^ a3
        t[4 * c + 3] = xtime(a0) ^ a0 ^ a1 ^ a2 ^ xtime(a3)
      }
    }
    for (let i = 0; i < 16; i++) s[i] = t[i] ^ rk[round * 16 + i]
  }
  output.set(s)
}

// 同步 CTR 内核：keystream 块 = AES-128(counterBlock)，跨 update 缓存部分块
class AesCtrSyncCore {
  constructor(keyBytes, ivBytes) {
    this._rk = expandKey(keyBytes)
    this._iv = ivBytes.slice()
    this._pos = 0
    this._ks = null
    this._ksBase = -1
  }
  _ksAt(base) {
    if (this._ks && this._ksBase === base) return this._ks
    const ks = new Uint8Array(16)
    encryptBlock(this._rk, incrementIV(this._iv, base / 16), ks)
    this._ks = ks
    this._ksBase = base
    return ks
  }
  update(data) {
    const out = new Uint8Array(data.length)
    let pos = 0
    // 1. 部分块续传
    const off = this._pos % 16
    if (off !== 0) {
      const n = Math.min(16 - off, data.length)
      const ks = this._ksAt(this._pos - off)
      for (let i = 0; i < n; i++) out[i] = data[i] ^ ks[off + i]
      pos = n
      this._pos += n
      if (off + n === 16) {
        this._ks = null
        this._ksBase = -1
      }
    }
    // 2. 整块直进
    const mid = ((data.length - pos) >> 4) << 4
    for (let end = pos + mid; pos < end; pos += 16, this._pos += 16) {
      const ks = this._ksAt(this._pos)
      for (let i = 0; i < 16; i++) out[pos + i] = data[pos + i] ^ ks[i]
    }
    // 3. 尾部部分块
    const tail = data.length - pos
    if (tail > 0) {
      const ks = this._ksAt(this._pos)
      for (let i = 0; i < tail; i++) out[pos + i] = data[pos + i] ^ ks[i]
      this._pos += tail
    }
    return out
  }
  setPosition(position) {
    this._pos = position
    this._ks = null
    this._ksBase = -1
  }
}

// 异步 subtle CTR 内核（文件流）：16 对齐中段批量直调，头/尾 keystream 缓存
class AesCtrSubtleCore {
  constructor(keyBytes, ivBytes) {
    this._key = keyBytes.slice()
    this._iv = ivBytes.slice()
    this._pos = 0
    this._ks = null
    this._ksBase = -1
    this._ck = null
  }
  async _ckey() {
    if (!this._ck) this._ck = await subtle.importKey('raw', this._key, 'AES-CTR', false, ['encrypt'])
    return this._ck
  }
  async _ksAt(base) {
    if (this._ks && this._ksBase === base) return this._ks
    // CTR 加密==解密，加密 16 字节零块即提取该块 keystream（zero^ks==ks）
    const ks = new Uint8Array(
      await subtle.encrypt({ name: 'AES-CTR', counter: incrementIV(this._iv, base / 16), length: 128 }, await this._ckey(), new Uint8Array(16))
    )
    this._ks = ks
    this._ksBase = base
    return ks
  }
  async update(data) {
    const out = new Uint8Array(data.length)
    let pos = 0
    // 1. 部分块续传
    const off = this._pos % 16
    if (off !== 0) {
      const n = Math.min(16 - off, data.length)
      const ks = await this._ksAt(this._pos - off)
      for (let i = 0; i < n; i++) out[i] = data[i] ^ ks[off + i]
      pos = n
      this._pos += n
      if (off + n === 16) {
        this._ks = null
        this._ksBase = -1
      }
    }
    // 2. 16 对齐中段批量直调（subtle 从整块 counter 起，输出即密文）
    const mid = ((data.length - pos) >> 4) << 4
    if (mid > 0) {
      const ct = await subtle.encrypt(
        { name: 'AES-CTR', counter: incrementIV(this._iv, this._pos / 16), length: 128 },
        await this._ckey(),
        data.subarray(pos, pos + mid)
      )
      out.set(new Uint8Array(ct), pos)
      pos += mid
      this._pos += mid
    }
    // 3. 尾部部分块：提取并缓存该块 keystream
    const tail = data.length - pos
    if (tail > 0) {
      const ks = await this._ksAt(this._pos)
      for (let i = 0; i < tail; i++) out[pos + i] = data[pos + i] ^ ks[i]
      this._pos += tail
    }
    return out
  }
  setPosition(position) {
    this._pos = position
    this._ks = null
    this._ksBase = -1
  }
}

// ======================= flowEnc 面向的 TjsAesCtr =======================
export default class TjsAesCtr {
  constructor(password, sizeSalt) {
    sizeSalt = sizeSalt + ''
    this.passwdOutward = password
    if (password.length !== 32) {
      this.passwdOutward = toHex(pbkdf2Sync(password, 'AES-CTR', 1000, 16, 'sha256'))
    }
    this.key = createHash('md5')
      .update(this.passwdOutward + sizeSalt)
      .digest()
    const iv = createHash('md5').update(sizeSalt).digest()
    this._sync = new AesCtrSyncCore(this.key, iv)
    this._stream = new AesCtrSubtleCore(this.key, iv)
  }
  // 同步路径（名字加解密；CTR 加密==解密）
  encrypt(data) {
    return this._sync.update(data)
  }
  decrypt(data) {
    return this._sync.update(data)
  }
  // 流路径（返回 Promise，TransformStream transform 回调原生支持）
  encryptStream(data) {
    return this._stream.update(data)
  }
  decryptStream(data) {
    return this._stream.update(data)
  }
  async setPositionAsync(position) {
    this._sync.setPosition(position)
    this._stream.setPosition(position)
  }
}
