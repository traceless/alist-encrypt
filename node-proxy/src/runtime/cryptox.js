/**
 * node:crypto 运行时分发（P2）—— tjs.importmap.json 中 'crypto' 的映射目标
 *
 * 背景：业务代码以裸名 `import crypto from 'crypto'` 顶层引用（httpClient/encNameRouter/router
 * 的 randomUUID，加密类的 createHash/pbkdf2Sync 等），tjs 无 node:crypto 且不解析 node_modules，
 * 由 import map 映射到本模块。node 端不经过 import map（原生解析裸名），行为零变化。
 *
 * tjs 下能力边界（P3 加密分发交付后）：
 *   - randomUUID/createHash：桥 runtime/hashing.js（双端输出已由金样逐字节锁定）
 *   - pbkdf2Sync：纯 JS PBKDF2-HMAC-SHA256（tjs:hashing 构造 HMAC，无原生同步派生；
 *     消费面仅加密类密码派生，1000 迭代毫秒级；输出与 node pbkdf2Sync 由金样逐字节锁定）
 *   - createCipheriv 等其余同步 API：tjs 分支由 flowEnc.tjs.js 独立实现承担
 */
import { IS_TJS } from './isTjs.js'
import { createHash as hashingCreateHash, randomUUID as hashingRandomUUID } from './hashing.js'

const encoder = new TextEncoder()

// HMAC-SHA256（RFC2104，经由本模块 createHash，双端等价）
function hmacSha256(keyBytes, msgBytes) {
  let k = keyBytes
  if (k.length > 64) {
    k = hashingCreateHash('sha256').update(k).digest()
  }
  const ipad = new Uint8Array(64)
  const opad = new Uint8Array(64)
  ipad.set(k)
  opad.set(k)
  for (let i = 0; i < 64; i++) {
    ipad[i] ^= 0x36
    opad[i] ^= 0x5c
  }
  const inner = hashingCreateHash('sha256').update(ipad).update(msgBytes).digest()
  return hashingCreateHash('sha256').update(opad).update(inner).digest()
}

// 纯 JS PBKDF2-HMAC-SHA256（RFC2898）。当前消费面仅加密类密码派生（dkLen 16、1000 迭代，单块）
function pbkdf2SyncTjs(password, salt, iterations, keylen, hash) {
  if (hash !== 'sha256' && hash !== undefined) {
    throw new Error(`pbkdf2Sync(tjs) 仅支持 sha256，收到: ${hash}`)
  }
  const toBytes = (v) => (typeof v === 'string' ? encoder.encode(v) : v)
  const P = toBytes(password)
  const S = toBytes(salt)
  const blocks = Math.ceil(keylen / 32)
  const dk = new Uint8Array(keylen)
  let offset = 0
  for (let block = 1; block <= blocks; block++) {
    // U1 = HMAC(P, S || INT(block))
    const intro = new Uint8Array(S.length + 4)
    intro.set(S)
    intro[S.length] = (block >>> 24) & 0xff
    intro[S.length + 1] = (block >>> 16) & 0xff
    intro[S.length + 2] = (block >>> 8) & 0xff
    intro[S.length + 3] = block & 0xff
    let u = hmacSha256(P, intro)
    const t = new Uint8Array(u)
    for (let i = 1; i < iterations; i++) {
      u = hmacSha256(P, u)
      for (let j = 0; j < t.length; j++) t[j] ^= u[j]
    }
    const take = Math.min(t.length, keylen - offset)
    dk.set(t.subarray(0, take), offset)
    offset += take
  }
  return dk
}

let impl
if (!IS_TJS) {
  impl = await import('node:crypto')
} else {
  impl = new Proxy(
    { createHash: hashingCreateHash, randomUUID: hashingRandomUUID, pbkdf2Sync: pbkdf2SyncTjs },
    {
      get(target, prop) {
        if (prop in target) return target[prop]
        if (typeof prop === 'string') {
          throw new Error(`crypto.${prop} 在 tjs 下不可用（加密分发由 flowEnc.tjs.js 独立实现承担）`)
        }
        return undefined
      },
    }
  )
}

export default impl
export const randomUUID = impl.randomUUID
export const createHash = impl.createHash
export const pbkdf2Sync = impl.pbkdf2Sync
