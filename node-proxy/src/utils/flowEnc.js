'use strict'

import MixEnc from './mixEnc'
import Rc4Md5 from './rc4Md5'
import AesCTR from './aesCTR'
import ChaCha20 from './chacha20'
import crypto from 'crypto'

const cachePasswdOutward = {}

class FlowEnc {
  constructor(password, encryptType = 'chacha20', fileSize = 0) {
    fileSize *= 1
    let encryptFlow = null
    // 使用缓存的密码避免大量计算
    const passwdOutward = cachePasswdOutward[password + encryptType]
    password = passwdOutward ? passwdOutward : password
    if (encryptType === 'chacha20') {
      console.log('@@chacha20', encryptType)
      encryptFlow = new ChaCha20(password, fileSize)
      this.passwdOutward = encryptFlow.passwdOutward
    }
    if (encryptType === 'mix') {
      console.log('@@mix', encryptType)
      encryptFlow = new MixEnc(password, fileSize)
      this.passwdOutward = encryptFlow.passwdOutward
    }
    if (encryptType === 'rc4') {
      console.log('@@rc4', encryptType, fileSize)
      encryptFlow = new Rc4Md5(password, fileSize)
      this.passwdOutward = encryptFlow.passwdOutward
    }
    if (encryptType === 'aesctr') {
      console.log('@@AesCTR', encryptType, fileSize)
      encryptFlow = new AesCTR(password, fileSize)
      this.passwdOutward = encryptFlow.passwdOutward
    }
    if (encryptType === null) {
      throw new Error('FlowEnc error')
    }
    cachePasswdOutward[password + encryptType] = this.passwdOutward
    this.encryptFlow = encryptFlow
    this.encryptType = encryptType
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
