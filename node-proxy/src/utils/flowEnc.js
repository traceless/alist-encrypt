'use strict'

import Rc4Md5 from './rc4Md5.js'
import AesCTR from './aesCTR.js'
import ChaCha20 from './chacha20.js'
import crypto from 'crypto'
import { IS_TJS } from '../runtime/isTjs.js'

// tjs 分支实现（P3 加密分发）：node 代码路径零改动，tjs 走独立文件 flowEnc.tjs.js
// （同步派生 + subtle/FFI 内核，transform 返回 Web TransformStream 形态）。
// 顶层动态 import 仅 tjs 执行（TLA），同时触发 tjs 侧 FFI 后端探测。
let TjsFlowEnc = null
if (IS_TJS) {
  TjsFlowEnc = (await import('./flowEnc.tjs.js')).default
}

const cachePasswdOutward = {}

class FlowEnc {
  constructor(password, encryptType = 'chacha20', fileSize = 0) {
    fileSize *= 1
    if (IS_TJS) {
      // tjs：独立实现（同步派生使 new FlowEnc 双端同步可用），接口与 node 版对齐。
      // transform 出口在 TjsFlowEnc 包装层（Web TransformStream 形态），覆盖类方法。
      const tjsFlow = new TjsFlowEnc(password, encryptType, fileSize)
      this.encryptFlow = tjsFlow.encryptFlow
      this.passwdOutward = tjsFlow.passwdOutward
      this.encryptType = encryptType
      this.key = tjsFlow.key
      this.encryptTransform = () => tjsFlow.encryptTransform()
      this.decryptTransform = () => tjsFlow.decryptTransform()
      return
    }
    let encryptFlow = null
    // 使用缓存的密码避免大量计算
    const passwdOutward = cachePasswdOutward[password + encryptType]
    password = passwdOutward ? passwdOutward : password
    if (encryptType === 'chacha20') {
      encryptFlow = new ChaCha20(password, fileSize)
    }
    if (encryptType === 'rc4') {
      encryptFlow = new Rc4Md5(password, fileSize)
    }
    if (encryptType === 'aesctr') {
      encryptFlow = new AesCTR(password, fileSize)
    }
    if (!encryptFlow) {
      throw new Error('FlowEnc error: 未知的encType ' + encryptType)
    }
    this.encryptFlow = encryptFlow
    this.passwdOutward = encryptFlow.passwdOutward
    this.encryptType = encryptType
    this.key = encryptFlow.key
    cachePasswdOutward[password + encryptType] = this.passwdOutward
  }

  async setPosition(position) {
    await this.encryptFlow.setPositionAsync(position)
  }

  // 加密流转换
  encryptTransform() {
    return this.encryptFlow.encryptTransform()
  }

  decryptTransform() {
    return this.encryptFlow.decryptTransform()
  }
}

FlowEnc.getPassWdOutward = function (password, encryptType) {
  if (IS_TJS) return TjsFlowEnc.getPassWdOutward(password, encryptType)
  const passwdOutward = cachePasswdOutward[password + encryptType]
  if (passwdOutward) {
    return passwdOutward
  }
  const flowEnc = new FlowEnc(password, encryptType, 1)
  return flowEnc.passwdOutward
}
// 用于文件加密的混淆
FlowEnc.getPassWdMd5Bytes = function (passwdOutward) {
  const passwdByte = cachePasswdOutward[passwdOutward]
  if (passwdByte) {
    return passwdByte
  }
  const md5Byte = crypto.createHash('md5').update(passwdOutward).digest()
  cachePasswdOutward[passwdOutward] = md5Byte
  return md5Byte
}

// const flowEnc = new FlowEnc('abc1234')
// const encode = flowEnc.encodeData('测试的明文加密1234￥%#')
// const decode = flowEnc.decodeData(encode)
// console.log('@@@decode', encode, decode.toString())
// console.log(new FlowEnc('e10adc3949ba56abbe5be95ff90a8636'))

export default FlowEnc
