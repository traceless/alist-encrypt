/**
 * S4 WASM 加密内核验证（WAMR，仅依赖 WebAssembly 标准 API）
 *
 * 验证目标：
 *   1. 正确性：WASM 内核 vs 纯 JS 参考实现（完整复刻 chacha20.js 语义）逐字节一致
 *      覆盖：基础流、奇数长度跨界、定位（seek）后继续流、往返
 *   2. 吞吐：64KB 分块（代理主路径）与 4KB 分块（最坏情况）
 *
 * 运行：tjs bench/wasm-crypto-bench.mjs   （node 亦可跑，交叉验证 wasm 产物）
 * 注：RC4 不做 WASM 兜底（迁移决策：rc4 存量算法不支持），仅验证 ChaCha20。
 */
'use strict'

const perf = globalThis.performance
const wasmDir = (() => {
  // 兼容 tjs（脚本目录推导）与 node（import.meta.url）
  if (typeof tjs !== 'undefined') {
    return decodeURIComponent(new URL(import.meta.url).pathname).replace(/[^/]*$/, '') + 'wasm/'
  }
  return new URL('./wasm/', import.meta.url).pathname
})()

function fillRandom(bytes) {
  globalThis.crypto.getRandomValues(bytes)
  return bytes
}

function throughput(mb, ms) {
  return ((mb * 1024 * 1024) / (ms / 1000) / (1024 * 1024)).toFixed(1)
}

// ---------- 加载 WASM ----------
async function loadWasm(file) {
  const bytes = typeof tjs !== 'undefined' ? await tjs.readFile(wasmDir + file) : new Uint8Array((await import('node:fs/promises')).readFile(wasmDir + file))
  const { instance } = await WebAssembly.instantiate(bytes)
  const exp = instance.exports
  const mem = new Uint8Array(exp.memory.buffer)
  const bufPtr = exp.cc20_buf_ptr()
  const bufSize = exp.cc20_buf_size()
  // 必须保留 instance 引用：tjs 中 Instance 被 GC 会销毁底层 module_inst，
  // 仅存 exports 会导致稍后调用报 "function not found"（实测挂在大量分配触发 GC 后）
  return { exp, mem, bufPtr, bufSize, instance }
}

// 共享缓冲调用协议：写入 → 调用 → 读回拷贝
function makeCaller(w) {
  return function call(fn, data) {
    if (data.length > w.bufSize) throw new Error(`data ${data.length} > buf ${w.bufSize}`)
    w.mem.set(data, w.bufPtr)
    const ret = fn(w.bufPtr, data.length)
    return w.mem.slice(w.bufPtr, w.bufPtr + (typeof ret === 'number' && ret > 0 ? ret : data.length))
  }
}

// ---------- ChaCha20 JS 参考实现（完整复刻 src/utils/chacha20.js） ----------
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

// ---------- 工具 ----------
function assertEq(a, b, label) {
  if (a.length !== b.length) throw new Error(`${label}: length ${a.length} != ${b.length}`)
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) throw new Error(`${label}: byte ${i} ${a[i]} != ${b[i]}`)
  }
}

// ---------- ChaCha20 正确性 + 吞吐 ----------
async function cc20Part() {
  const key = fillRandom(new Uint8Array(32))
  const nonce = fillRandom(new Uint8Array(12))
  const w = await loadWasm('chacha20_core.wasm')
  const call = makeCaller(w)
  const r = []
  const pass = (n) => {
    r.push(`PASS ${n}`)
    console.log(`PASS ${n}`)
  }

  // init 共享缓冲传 key+nonce：key 在前 32B，nonce 紧随其后
  const initWasm = () => {
    const kv = new Uint8Array(44)
    kv.set(key, 0)
    kv.set(nonce, 32)
    w.mem.set(kv, w.bufPtr)
    w.exp.cc20_init(w.bufPtr, w.bufPtr + 32, 1)
  }

  // 1. 基础流：counter=1 连续 64KB × 8（奇数长度也测）
  {
    const ref = new RefChaCha20(key, nonce, 1)
    initWasm()
    const chunk = fillRandom(new Uint8Array(64 * 1024))
    for (let i = 0; i < 8; i++) {
      const refOut = ref.update(chunk.slice())
      const wasmOut = call(w.exp.cc20_crypt, chunk)
      assertEq(wasmOut, refOut, `cc20-basic chunk${i}`)
    }
    pass('cc20-basic (0.5MB)')
  }

  // 2. 奇数长度块 + 跨 keystream 块
  {
    const ref = new RefChaCha20(key, nonce, 1)
    initWasm()
    const sizes = [1, 63, 64, 65, 127, 4097, 65535]
    for (const sz of sizes) {
      const data = fillRandom(new Uint8Array(sz))
      const refOut = ref.update(data.slice())
      const wasmOut = call(w.exp.cc20_crypt, data)
      assertEq(wasmOut, refOut, `cc20-odd size=${sz}`)
    }
    pass('cc20-odd-sizes (1/63/64/65/127/4097/65535)')
  }

  // 3. 定位：setPosition(123457) 后继续
  {
    const POS = 123457
    const ref = new RefChaCha20(key, nonce, 1)
    ref.setPosition(POS)
    initWasm()
    w.exp.cc20_seek(POS)
    const chunk = fillRandom(new Uint8Array(64 * 1024))
    for (let i = 0; i < 4; i++) {
      const refOut = ref.update(chunk.slice())
      const wasmOut = call(w.exp.cc20_crypt, chunk)
      assertEq(wasmOut, refOut, `cc20-seek chunk${i}`)
    }
    pass('cc20-seek (position=123457, counter jump + skip)')
  }

  // 4. 往返
  {
    const data = fillRandom(new Uint8Array(64 * 1024))
    initWasm()
    const enc = call(w.exp.cc20_crypt, data)
    initWasm() // counter 回 1
    const dec = call(w.exp.cc20_crypt, enc)
    assertEq(dec, data, 'cc20-roundtrip')
    pass('cc20-roundtrip')
  }

  // 5. 吞吐
  {
    initWasm()
    const chunk = fillRandom(new Uint8Array(64 * 1024))
    let processed = 0
    const total = 256 * 1024 * 1024
    const t0 = perf.now()
    while (processed < total) {
      call(w.exp.cc20_crypt, chunk)
      processed += chunk.length
    }
    r.push(`cc20-wasm(256MB/64KB): ${throughput(256, perf.now() - t0)} MB/s`)

    const small = fillRandom(new Uint8Array(4096))
    let p2 = 0
    const t2 = perf.now()
    while (p2 < 64 * 1024 * 1024) {
      call(w.exp.cc20_crypt, small)
      p2 += small.length
    }
    r.push(`cc20-wasm(64MB/4KB): ${throughput(64, perf.now() - t2)} MB/s`)
  }
  return r
}

// ---------- 主流程 ----------
async function main() {
  const runtime = typeof tjs !== 'undefined' ? `tjs(${tjs.engine?.versions?.quickjs || 'quickjs'})` : 'node22'
  console.log(`=== wasm-crypto-bench @ ${runtime} ===`)
  console.log('--- chacha20_core.wasm ---')
  ;(await cc20Part()).forEach((l) => console.log(l))
  console.log('=== DONE ===')
}

main()
