/**
 * node:stream 运行时分发（P2）—— tjs.importmap.json 中 'stream' 的映射目标
 *
 * node：原样转发 node:stream（httpClient 的 Readable、加密流的 Transform，行为零变化）。
 * tjs：仅提供模块加载所需的类壳——aesCTR/rc4Md5/chacha20/rc4fix 顶层
 *   `class X extends Transform` 求值时 Transform 必须可作为继承基类（否则整机启动即炸），
 *   故类壳不做任何事，实例化（new FlowEnc → new AesCTR → super()）即抛明确错误。
 *   tjs 分支的实际流处理走 Web 流（httpClient 的 tjs 路径；加密 TransformStream 由 P3 交付）。
 */
import { IS_TJS } from './isTjs.js'

let Readable, Transform, Writable
if (!IS_TJS) {
  const s = await import('node:stream')
  ;({ Readable, Transform, Writable } = s)
} else {
  class NodeStreamShim {
    constructor() {
      throw new Error('node:stream 在 tjs 下不可用，node 流形态的加密 transform 由 P3 Web 流实现交付')
    }
  }
  Readable = class extends NodeStreamShim {}
  Transform = class extends NodeStreamShim {}
  Writable = class extends NodeStreamShim {}
}

export { Readable, Transform, Writable }
