/**
 * S1 加密吞吐基准 + 密钥派生比对（双运行时：Node 22 / txiki.js）
 *
 * 运行方式：
 *   node   bench/crypto-bench.mjs          # Node 基线（OpenSSL webcrypto）
 *   tjs    bench/crypto-bench.mjs          # txiki（QuickJS 无 JIT）
 *
 * 通过线（go/no-go 红线）：
 *   S1a subtle AES-CTR 分块 ≥ 80MB/s
 *   S1b 纯 JS ChaCha20     ≥ 30MB/s
 *   S1c 纯 JS RC4          ≥ 30MB/s
 *   密钥派生链输出双端逐字节一致（与 node-proxy/src/utils/aesCTR.js 对齐）
 */
'use strict'

const IS_TJS = typeof tjs !== 'undefined'
const subtle = globalThis.crypto.subtle
const perf = globalThis.performance

// ---------- 工具 ----------
function fillRandom(bytes) {
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function throughput(mb, ms) {
  return ((mb * 1024 * 1024) / (ms / 1000) / (1024 * 1024)).toFixed(1)
}

// ---------- S1a: subtle AES-CTR 分块吞吐 ----------
// counter 递增逻辑与 node-proxy/src/utils/aesCTR.js 的 incrementIV64 一致：
// 后 8 字节为计数器域（BigUint64 大端），每 16 字节 +1
function incrementIV64(counter, blocks) {
  const res = new Uint8Array(counter)
  const dv = new DataView(res.buffer)
  let val = dv.getBigUint64(8, false)
  val += BigInt(blocks)
  dv.setBigUint64(8, val, false)
  return res
}

async function benchAesCtr(subtle_, totalMB, blockSize) {
  const keyBytes = fillRandom(new Uint8Array(16))
  const key = await subtle_.importKey('raw', keyBytes, 'AES-CTR', false, ['encrypt'])
  const block = fillRandom(new Uint8Array(blockSize))
  let counter = fillRandom(new Uint8Array(16))
  const blocksPerChunk = blockSize / 16
  const t0 = perf.now()
  let processed = 0
  while (processed < totalMB * 1024 * 1024) {
    await subtle_.encrypt({ name: 'AES-CTR', counter: counter.slice(), length: 128 }, key, block)
    counter = incrementIV64(counter, blocksPerChunk)
    processed += blockSize
  }
  return perf.now() - t0
}

// ---------- S1b: 纯 JS ChaCha20（摘自 node-proxy/src/utils/chacha20.js，算法主体原样） ----------
class ChaCha20Core {
  // 直接走源码的 _constructor 测试路径：固定 key/nonce，不经 node:crypto 派生
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
    let pos
    for (let i = 0; i < u32.length; i++) {
      pos = i * 4
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
    return this._keystream
  }
  update(data) {
    const out = new Uint8Array(data.length)
    let pos = 0
    while (pos < data.length) {
      const len = Math.min(64, data.length - pos)
      for (let i = 0; i < len; i++) {
        if (this._bufPos % 64 === 0) {
          this._block()
        }
        out[pos + i] = data[pos + i] ^ this._keystream[this._bufPos++]
      }
      pos += len
    }
    return out
  }
}

function benchChaCha20(totalMB, blockSize) {
  const key = new Uint8Array(32).fill(1)
  const nonce = new Uint8Array(12).fill(2)
  const cipher = new ChaCha20Core(key, nonce, 1)
  const block = fillRandom(new Uint8Array(blockSize))
  const t0 = perf.now()
  let processed = 0
  while (processed < totalMB * 1024 * 1024) {
    cipher.update(block)
    processed += blockSize
  }
  return perf.now() - t0
}

// ---------- S1c: 纯 JS RC4（摘自 node-proxy/src/utils/rc4Md5.js，KSA/PRGA 原样） ----------
class Rc4Core {
  constructor(keyBytes) {
    this.i = 0
    this.j = 0
    this.sbox = []
    this.initKSA(keyBytes)
  }
  initKSA(key) {
    const K = []
    for (let i = 0; i < 256; i++) {
      this.sbox[i] = i
    }
    for (let i = 0; i < 256; i++) {
      K[i] = key[i % key.length]
    }
    for (let i = 0, j = 0; i < 256; i++) {
      j = (j + this.sbox[i] + K[i]) % 256
      const temp = this.sbox[i]
      this.sbox[i] = this.sbox[j]
      this.sbox[j] = temp
    }
    this.i = 0
    this.j = 0
  }
  PRGAExcute(buf) {
    let { sbox: S, i, j } = this
    for (let k = 0; k < buf.length; k++) {
      i = (i + 1) % 256
      j = (j + S[i]) % 256
      const temp = S[i]
      S[i] = S[j]
      S[j] = temp
      buf[k] ^= S[(S[i] + S[j]) % 256]
    }
    this.i = i
    this.j = j
    return buf
  }
}

function benchRc4(totalMB, blockSize) {
  const rc4 = new Rc4Core(fillRandom(new Uint8Array(16)))
  const block = fillRandom(new Uint8Array(blockSize))
  const t0 = perf.now()
  let processed = 0
  while (processed < totalMB * 1024 * 1024) {
    rc4.PRGAExcute(block)
    processed += blockSize
  }
  return perf.now() - t0
}

// ---------- 密钥派生链比对 ----------
// 链条与 aesCTR.js 构造器一致：
//   pbkdf2Sync(password, 'AES-CTR', 1000, 16, 'sha256').hex  → passwdOutward
//   md5(passwdOutward + sizeSalt)                             → key（16 字节）
//   md5(sizeSalt)                                             → iv（16 字节）
async function deriveChain(password, sizeSalt) {
  if (!IS_TJS) {
    const nodeCrypto = (await import('node:crypto')).default
    const passwdOutward =
      password.length !== 32
        ? nodeCrypto.pbkdf2Sync(password, 'AES-CTR', 1000, 16, 'sha256').toString('hex')
        : password
    const key = nodeCrypto.createHash('md5').update(passwdOutward + sizeSalt).digest()
    const iv = nodeCrypto.createHash('md5').update(sizeSalt + '').digest()
    return { passwdOutward, key: toHex(key), iv: toHex(iv) }
  }
  // txiki: PBKDF2 走 subtle，MD5 走 tjs:hashing
  const { createHash } = await import('tjs:hashing')
  const enc = new TextEncoder()
  let passwdOutward = password
  if (password.length !== 32) {
    const keyMaterial = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', salt: enc.encode('AES-CTR'), iterations: 1000, hash: 'SHA-256' },
      keyMaterial,
      128,
    )
    passwdOutward = toHex(new Uint8Array(bits))
  }
  const key = createHash('md5').update(enc.encode(passwdOutward + sizeSalt)).bytes()
  const iv = createHash('md5').update(enc.encode(sizeSalt + '')).bytes()
  return { passwdOutward, key: toHex(key), iv: toHex(iv) }
}

// ---------- 主流程 ----------
const TOTAL_MB = 256
const BLOCK_64K = 64 * 1024

async function main() {
  const runtime = IS_TJS ? `tjs(${tjs.engine?.versions?.quickjs || 'quickjs'})` : 'node22'
  console.log(`=== crypto-bench @ ${runtime} ===`)

  // 已知向量断言（双端必须一致）
  const v = await deriveChain('test123456', '1700000000123')
  console.log('derive-chain:', JSON.stringify(v))

  const msCtr = await benchAesCtr(subtle, TOTAL_MB, BLOCK_64K)
  console.log(`S1a aes-ctr-subtle(${TOTAL_MB}MB/64KB): ${throughput(TOTAL_MB, msCtr)} MB/s`)

  const msCha = benchChaCha20(TOTAL_MB, BLOCK_64K)
  console.log(`S1b chacha20-purejs(${TOTAL_MB}MB/64KB): ${throughput(TOTAL_MB, msCha)} MB/s`)

  const msRc4 = benchRc4(TOTAL_MB, BLOCK_64K)
  console.log(`S1c rc4-purejs(${TOTAL_MB}MB/64KB): ${throughput(TOTAL_MB, msRc4)} MB/s`)

  // 64KB 小块极端场景（上游转发最坏情况）
  const msCtrSmall = await benchAesCtr(subtle, 64, 4096)
  console.log(`S1a2 aes-ctr-subtle(64MB/4KB): ${throughput(64, msCtrSmall)} MB/s`)

  console.log('=== thresholds: S1a>=80 S1b>=30 S1c>=30 ===')
}

main()
