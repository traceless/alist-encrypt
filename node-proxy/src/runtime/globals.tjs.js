// tjs 运行时全局垫片（P3）：名字加解密链路（commonUtil/crcn/mixBase64 等）裸用全局 Buffer，
// node 下是全局对象，tjs 下需挂载 import map 的 bufferx 实现。node 加载本文件为 no-op。
import { IS_TJS } from './isTjs.js'

if (IS_TJS) {
  const { bufferShim } = await import('./bufferx.js')
  globalThis.Buffer = bufferShim
}
