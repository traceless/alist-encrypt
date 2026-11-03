/**
 * node:crypto 运行时分发（P2）—— tjs.importmap.json 中 'crypto' 的映射目标
 *
 * 背景：业务代码以裸名 `import crypto from 'crypto'` 顶层引用（httpClient/encNameRouter/router
 * 的 randomUUID，加密类的 createHash/pbkdf2Sync 等），tjs 无 node:crypto 且不解析 node_modules，
 * 由 import map 映射到本模块。node 端不经过 import map（原生解析裸名），行为零变化。
 *
 * tjs 下能力边界（P2 服务路径仅需 randomUUID/createHash）：
 *   - randomUUID/createHash：桥 runtime/hashing.js（双端输出已由金样逐字节锁定）
 *   - pbkdf2Sync/createCipheriv 等同步派生：tjs 无同步等价物，属 P3 加密分发范围，
 *     调用即抛明确错误（加密路由在 tjs 分支由 P3 交付后可用，P2 阶段 new FlowEnc 会先于此类调用触达）
 */
import { IS_TJS } from './isTjs.js'
import { createHash as hashingCreateHash, randomUUID as hashingRandomUUID } from './hashing.js'

let impl
if (!IS_TJS) {
  impl = await import('node:crypto')
} else {
  impl = new Proxy(
    { createHash: hashingCreateHash, randomUUID: hashingRandomUUID },
    {
      get(target, prop) {
        if (prop in target) return target[prop]
        if (typeof prop === 'string') {
          throw new Error(`crypto.${prop} 在 tjs 下由 P3 加密分发交付（当前阶段加密路由不可用）`)
        }
        return undefined
      },
    }
  )
}

export default impl
export const randomUUID = impl.randomUUID
export const createHash = impl.createHash
