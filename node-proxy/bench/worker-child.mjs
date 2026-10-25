/**
 * S3 Worker 子线程：接收 transferable ArrayBuffer，逐字节 +1 后回传
 * （等价 PRGAThread 的"消息进 → 计算出"模式，算法无关）
 */
'use strict'

self.onmessage = (e) => {
  const { buf } = e.data
  const out = new Uint8Array(buf)
  for (let i = 0; i < out.length; i++) {
    out[i] = out[i] + 1
  }
  self.postMessage(out, [out.buffer])
}
