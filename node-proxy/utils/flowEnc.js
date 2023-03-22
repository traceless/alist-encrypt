import crypto from 'crypto'
import { Transform } from 'stream'
import { userPasswd } from '../config.js'

class FlowEnc {
  constructor(password) {
    this.password = password
    this.passwordMd5 = crypto.createHash('md5').digest('hex')
    // 说明是输入encode的秘钥，用于找回文件加解密
    let encode
    if (password.length === 32) {
      encode = FlowEnc.checkEncode(password)
      if (!encode) {
        throw new Error('encode Invalid')
      }
    }
    const md5 = crypto.createHash('md5')
    encode = md5.update(password).digest()
    const decode = []
    const length = encode.length
    const decodeCheck = {}
    for (let i = 0; i < length; i++) {
      const enc = encode[i] ^ i
      // 这里会产生冲突
      if (!decodeCheck[enc % length]) {
        // console.log("取模 " + enc % length)
        decode[enc % length] = encode[i] & 0xff
        decodeCheck[enc % length] = encode[i]
      } else {
        for (let j = 0; j < length; j++) {
          if (!decodeCheck[j]) {
            // 兜底，把 encode[i]后四位转成 j ^ i 的二进制值，确保decode的后四位不冲突
            encode[i] = (encode[i] & 0xf0) | (j ^ i)
            decode[j] = encode[i] & 0xff
            decodeCheck[j] = encode[i]
            // console.log("#取模 " + j)
            break
          }
        }
      }
    }
    this.encode = encode
    this.decode = Buffer.from(decode)
    console.log('@encode:', this.encode.toString('hex'))
    console.log('@decode:', this.decode.toString('hex'))
  }

  // MD5
  md5(content) {
    const md5 = crypto.createHash('md5')
    return md5.update(this.passwordMd5 + content).digest('hex')
  }

  // 加密流转换
  encodeTransform() {
    return new Transform({
      // 匿名函数确保this是指向 FlowEnc
      transform: (chunk, encoding, next) => {
        next(null, this.encodeData(chunk))
      },
    })
  }

  decodeTransform() {
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
      data[i] = this.encode[data[i] % 16] ^ (data[i] & 0xff)
    }
    return data
  }

  // 解密方法
  decodeData(data) {
    for (let i = data.length; i--; ) {
      data[i] = this.decode[data[i] % 16] ^ (data[i] & 0xff)
    }
    return data
  }
}
FlowEnc.encMd5 = function (content) {
  const md5 = crypto.createHash('md5')
  return md5.update(userPasswd + content).digest('hex')
}
// 检查 encode 是否正确使用的
FlowEnc.checkEncode = function (_encode) {
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
// const flowEnc = new FlowEnc('abc1234')
// const encode = flowEnc.encodeData('测试的明文加密1234￥%#')
// const decode = flowEnc.decodeData(encode)
// console.log('@@@decode', encode, decode.toString())
// console.log(new FlowEnc('e10adc3949ba56abbe5be95ff90a8636'))

export default FlowEnc
