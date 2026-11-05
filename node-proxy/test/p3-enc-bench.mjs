// P3 吞吐验证：加密 transform 流式吞吐（tjs 红线 20MB/s）
// 用途限定 tjs（node 基线已在 S2 实测 235MB/s；node 端 Web Streams 全局与 tjs 有兼容差异）
import { IS_TJS } from '../src/runtime/isTjs.js'
import FlowEnc from '../src/utils/flowEnc.js'

if (!IS_TJS) {
  console.log('本基准面向 tjs 运行时（node 基线 235MB/s，见 S2 实测），跳过')
  process.exit(0)
}

const SIZE = 8 * 1024 * 1024
const CHUNKS = []
for (let off = 0; off < SIZE; off += 64 * 1024) CHUNKS.push(new Uint8Array(64 * 1024).fill(off & 0xff))

// TransformStream 全流管道吞吐
async function benchStream(encType) {
  const fe = new FlowEnc('123456', encType, 1048577)
  const ts = fe.encryptTransform()
  const t0 = performance.now()
  let total = 0
  const rs = new ReadableStream({
    start(c) {
      for (const chunk of CHUNKS) c.enqueue(chunk)
      c.close()
    },
  })
  await rs.pipeThrough(ts).pipeTo(
    new WritableStream({
      write(chunk) {
        total += chunk.length
      },
    }),
  )
  const ms = performance.now() - t0
  return { total, mbps: (total / 1024 / 1024) / (ms / 1000) }
}

console.log(`=== P3 吞吐基准（8MB / 64KB chunks）===`)
for (const encType of ['aesctr', 'chacha20']) {
  const r = await benchStream(encType)
  console.log(`${encType}: ${r.mbps.toFixed(1)} MB/s (${r.total} bytes)  ${r.mbps >= 20 ? 'PASS(红线20)' : 'FAIL(红线20)'}`)
}
