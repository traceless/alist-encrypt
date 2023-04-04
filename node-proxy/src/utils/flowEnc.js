'use strict'

import MixEnc from './mixEnc.js'
import Rc4 from './rc4.js'
import Rc4back from './rc4back.js'
import ChaCha20Poly from './chaCha20Poly.js'

class FlowEnc {
  constructor(password, encryptType = 'mix', fileSize = 0) {
    fileSize *= 1
    let encryptFlow = null
    if (encryptType === 'mix') {
      console.log('@@mix', encryptType)
      encryptFlow = new MixEnc(password, fileSize)
      this.passwdOutward = encryptFlow.passwdOutward
    }
    if (encryptType === 'rc4') {
      console.log('@@rc4', encryptType, fileSize)
      encryptFlow = new Rc4(password, fileSize)
      this.passwdOutward = encryptFlow.passwdOutward
    }
    if (encryptType === 'rc4back') {
      console.log('@@Rc4back', encryptType, fileSize)
      encryptFlow = new Rc4back(password, fileSize)
      this.passwdOutward = encryptFlow.passwdOutward
    }
    if (encryptType === 'cha20') {
      console.log('@@ChaCha20Poly', encryptType, fileSize)
      encryptFlow = new ChaCha20Poly(password, fileSize)
      this.passwdOutward = encryptFlow.passwdOutward
    }
    if (encryptType === null) {
      throw new Error('FlowEnc error')
    }
    this.encryptFlow = encryptFlow
    this.encryptType = encryptType
  }

  async setPosition(position) {
    await this.encryptFlow.setPositionAsync(position)
  }

  async cachePosition() {
    await this.encryptFlow.cachePosition()
  }

  // 加密流转换
  encryptTransform() {
    return this.encryptFlow.encryptTransform()
  }

  decryptTransform() {
    return this.encryptFlow.decryptTransform()
  }
}

// const flowEnc = new FlowEnc('abc1234')
// const encode = flowEnc.encodeData('测试的明文加密1234￥%#')
// const decode = flowEnc.decodeData(encode)
// console.log('@@@decode', encode, decode.toString())
// console.log(new FlowEnc('e10adc3949ba56abbe5be95ff90a8636'))

export default FlowEnc
