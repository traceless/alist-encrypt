/**
 * 哈希/PBKDF2/UUID 运行时分发（P1 R1）
 *
 * 接口对齐 node:crypto 用法，消费方迁移面最小：
 *   createHash('md5').update(data).digest('hex')   -> hex 字符串
 *   createHash('sha256').update(data).digest()     -> Uint8Array（node 语义为 Buffer，本层统一 Uint8Array）
 *   await pbkdf2(password, salt, iter, keylen, hash) -> Promise<Uint8Array>
 *   randomUUID()                                    -> v4 字符串
 *
 * node 下全走原生实现（A/B 不回退）；tjs 下 tjs:hashing + subtle，
 * 两者输出已由 test/crypto-golden-test.mjs 金样逐字节锁定。
 *
 * 注意：'crypto' 与 'tjs:hashing' 互相解析不了，只能按运行时顶层分支
 * 动态 import（双端 ESM 顶层 await 均支持，已实测）。
 */
import { IS_TJS } from './isTjs.js'

let nodeCrypto = null
let tjsCreateHash = null
if (IS_TJS) {
  ;({ createHash: tjsCreateHash } = await import('tjs:hashing'))
} else {
  nodeCrypto = await import('node:crypto')
}

const encoder = new TextEncoder()

function toBytes(data) {
  if (typeof data === 'string') return encoder.encode(data)
  return data
}

/**
 * @param {'md5'|'sha256'} algo
 * @returns {{ update(data: string|Uint8Array): any, digest(enc?: 'hex'): Uint8Array|string }}
 */
export function createHash(algo) {
  if (!IS_TJS) {
    const h = nodeCrypto.createHash(algo)
    const wrap = {
      update(data) {
        h.update(toBytes(data))
        return wrap
      },
      digest(enc) {
        return enc === 'hex' ? h.digest('hex') : new Uint8Array(h.digest())
      },
    }
    return wrap
  }
  const h = tjsCreateHash(algo)
  const wrap = {
    update(data) {
      h.update(toBytes(data))
      return wrap
    },
    digest(enc) {
      return enc === 'hex' ? h.digest() : h.bytes()
    },
  }
  return wrap
}

/**
 * PBKDF2（双端统一 async；node 原生 crypto.pbkdf2，tjs subtle.deriveBits）
 * tjs 无同步 PBKDF2，加密类的 sync 派生在 P3 工厂化时统一转 await 本接口
 *
 * @param {string|Uint8Array} password
 * @param {string|Uint8Array} salt
 * @param {number} iterations
 * @param {number} keylen 派生字节数
 * @param {'sha256'} hash 摘要算法（当前消费面仅 sha256）
 * @returns {Promise<Uint8Array>}
 */
export async function pbkdf2(password, salt, iterations, keylen, hash = 'sha256') {
  if (!IS_TJS) {
    const { promisify } = await import('node:util')
    return new Uint8Array(await promisify(nodeCrypto.pbkdf2)(password, salt, iterations, keylen, hash))
  }
  const subtle = globalThis.crypto.subtle
  const key = await subtle.importKey('raw', toBytes(password), 'PBKDF2', false, ['deriveBits'])
  // WebCrypto 标准名为带连字符形式（'sha256' -> 'SHA-256'）
  const wcHash = { sha256: 'SHA-256' }[hash.toLowerCase()] ?? hash.toUpperCase()
  const bits = await subtle.deriveBits({ name: 'PBKDF2', salt: toBytes(salt), iterations, hash: wcHash }, key, keylen * 8)
  return new Uint8Array(bits)
}

/** RFC4122 v4 UUID（node/tjs 全局 crypto 均原生提供） */
export function randomUUID() {
  return globalThis.crypto.randomUUID()
}

export function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
