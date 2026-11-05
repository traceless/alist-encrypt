/**
 * tjs 版 FlowEnc（P3 加密分发）—— node 版见 flowEnc.js（零改动），本文件仅 tjs 运行时加载
 *
 * 分发方式：flowEnc.js 顶层 `if (IS_TJS) await import('./flowEnc.tjs.js')`（TLA），
 * `new FlowEnc(...)` 在 tjs 下进入 IS_TJS 分支转发到本类。调用点零改动。
 *
 * 同步派生的实现基础：tjs 无 node:crypto，密码派生用纯 JS PBKDF2-HMAC-SHA256
 * （runtime/cryptox.js，tjs:hashing 构造 HMAC，1000 迭代毫秒级），使 passwdOutward/key
 * 派生保持同步 —— encodeName/decodeName 的同步调用链（名字加解密）无需改造。
 *
 * transform 形态按运行时返回：node 为 Transform 流，tjs 为 Web TransformStream
 * （httpClient.tjs.js 经 pipeThrough 消费）。aesctr 流路径为 subtle 异步批量，
 * transform 回调返回 Promise（Web Streams 规范原生支持）。
 *
 * rc4 按用户决策不迁移（不测不兜底），tjs 分支显式拒绝。
 */
import { pbkdf2Sync } from '../runtime/cryptox.js'
import TjsAesCtr from './aesCTR.tjs.js'
import TjsChaCha20 from './chacha20.tjs.js'

function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// passwdOutward 缓存（等价 node 版 flowEnc.js 的 cachePasswdOutward，键=password+encType）
const cachePasswdOutward = {}

function deriveOutward(password, pbkdf2Salt, encType) {
  const cacheKey = password + encType
  if (cachePasswdOutward[cacheKey]) return cachePasswdOutward[cacheKey]
  let outward = password
  if (password.length !== 32) {
    outward = toHex(pbkdf2Sync(password, pbkdf2Salt, 1000, 16, 'sha256'))
  }
  cachePasswdOutward[cacheKey] = outward
  return outward
}

// 双端共用的 TransformStream 构造：aesctr 流路径返回 Promise（subtle），chacha20 为同步值
function makeTransform(flow, isEncrypt) {
  return new TransformStream({
    transform(chunk, controller) {
      const out = isEncrypt ? flow.encryptStream(chunk) : flow.decryptStream(chunk)
      if (out && typeof out.then === 'function') {
        return out.then((bytes) => controller.enqueue(bytes))
      }
      controller.enqueue(out)
    },
  })
}

class TjsFlowEnc {
  constructor(password, encryptType = 'chacha20', fileSize = 0) {
    fileSize *= 1
    let encryptFlow = null
    if (encryptType === 'chacha20') {
      encryptFlow = new TjsChaCha20(password, fileSize)
    }
    if (encryptType === 'aesctr') {
      encryptFlow = new TjsAesCtr(password, fileSize)
    }
    if (encryptType === 'rc4') {
      throw new Error('rc4 在 tjs 运行时不可用（用户决策：不测不兜底不迁移，请改用 aesctr/chacha20）')
    }
    if (!encryptFlow) {
      throw new Error('FlowEnc error: 未知的encType ' + encryptType)
    }
    this.encryptFlow = encryptFlow
    this.encryptType = encryptType
    this.key = encryptFlow.key
  }
  get passwdOutward() {
    return this.encryptFlow.passwdOutward
  }

  async setPosition(position) {
    await this.encryptFlow.setPositionAsync(position)
  }

  // 加密流转换（Web TransformStream 形态）
  encryptTransform() {
    return makeTransform(this.encryptFlow, true)
  }

  decryptTransform() {
    return makeTransform(this.encryptFlow, false)
  }
}

// 等价 node 版静态方法（decodeOldName 消费，同步）
TjsFlowEnc.getPassWdOutward = function (password, encryptType) {
  if (encryptType === 'chacha20') return deriveOutward(password, 'CHA20', 'chacha20')
  if (encryptType === 'aesctr') return deriveOutward(password, 'AES-CTR', 'aesctr')
  throw new Error('FlowEnc error: 未知的encType ' + encryptType)
}

export default TjsFlowEnc
