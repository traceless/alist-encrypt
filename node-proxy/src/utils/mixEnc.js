'use strict'

import crypto from 'crypto'
import { Transform } from 'stream'

/**
 * 混淆算法，加密强度低，容易因为文件特征被破解。可以提升encode长度来对抗
 */
class MixEnc {
  constructor(password) {
    this.password = password
    // 说明是输入encode的秘钥，用于找回文件加解密
    this.passwdOutward = password
    // check base64
    if (password.length !== 32) {
      this.passwdOutward = crypto.pbkdf2Sync(this.password, 'MIX', 1000, 16, 'sha256').toString('hex')
    }
    console.log('MixEnc.passwdOutward', this.passwdOutward)
    const encode = crypto.createHash('sha256').update(this.passwdOutward).digest()
    const decode = []
    const length = encode.length
    const decodeCheck = {}
    for (let i = 0; i < length; i++) {
      const enc = encode[i] ^ i
      // 这里会产生冲突
      if (!decodeCheck[enc % length]) {
        decode[enc % length] = encode[i] & 0xff
        decodeCheck[enc % length] = encode[i]
      } else {
        for (let j = 0; j < length; j++) {
          if (!decodeCheck[j]) {
            encode[i] = (encode[i] & length) | (j ^ i)
            decode[j] = encode[i] & 0xff
            decodeCheck[j] = encode[i]
            break
          }
        }
      }
    }
    this.encode = encode
    this.decode = Buffer.from(decode)
    // console.log('@encode:', this.encode.toString('hex'))
    // console.log('@decode:', this.decode.toString('hex'))
  }

  // MD5
  md5(content) {
    const md5 = crypto.createHash('md5')
    return md5.update(this.passwdOutward + content).digest('hex')
  }

  async setPositionAsync() {
    console.log('in the mix ')
  }

  // 加密流转换
  encryptTransform() {
    return new Transform({
      // 匿名函数确保this是指向 FlowEnc
      transform: (chunk, encoding, next) => {
        next(null, this.encodeData(chunk))
      },
    })
  }

  decryptTransform() {
    // 解密流转换，不能单实例
    return new Transform({
      transform: (chunk, encoding, next) => {
        // this.push()  用push也可以
        next(null, this.decodeData(chunk))
      },
    })
  }

  // 加密方法
  encodeData(data) {
    data = Buffer.from(data)
    for (let i = data.length; i--; ) {
      data[i] ^= this.encode[data[i] % 32]
    }
    return data
  }

  // 解密方法
  decodeData(data) {
    for (let i = data.length; i--; ) {
      data[i] ^= this.decode[data[i] % 32]
    }
    return data
  }
}

// 检查 encode 是否正确使用的
MixEnc.checkEncode = function (_encode) {
  const encode = Buffer.from(_encode, 'hex')
  const length = encode.length
  const decodeCheck = {}
  for (let i = 0; i < encode.length; i++) {
    const enc = encode[i] ^ i
    // 这里会产生冲突
    if (!decodeCheck[enc % length]) {
      decodeCheck[enc % length] = encode[i]
    } else {
      return null
    }
  }
  return encode
}

// const flowEnc = new MixEnc('abc1234', 1234)
// const encode = flowEnc.encodeData('测试的明文加密1234￥%#')
// const nwe = new MixEnc('5fc8482ac3a7b3fd9325566dfdd31673', 1234)
// const decode = nwe.decodeData(encode)
// console.log('@@@decode', encode, decode.toString())

export default MixEnc
