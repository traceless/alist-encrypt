import crypto from 'crypto'
import { Transform } from 'stream'
import { userPasswd } from '../config.js'

class FlowEnc {
  constructor(password) {
    const md5 = crypto.createHash('md5')
    const encode = md5.update(password).digest()
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
    this.password = password
    this.passwordMd5 = crypto.createHash('md5').digest('hex')
    this.encode = encode
    this.decode = Buffer.from(decode)
    // MD5
    this.md5 = function (content) {
      const md5 = crypto.createHash('md5')
      return md5.update(this.passwordMd5 + content).digest('hex')
    }
    // 加密流转换
    this.encodeTransform = function () {
      return new Transform({
        // 匿名函数确保this是指向 FlowEnc
        transform: (chunk, encoding, next) => {
          next(null, this.encodeData(chunk))
        },
      })
    }
    // 解密流转换，不能单实例
    this.decodeTransform = function () {
      return new Transform({
        transform: (chunk, encoding, next) => {
          // this.push()  用push也可以
          next(null, this.decodeData(chunk))
        },
      })
    }
    // 不处理
    this.testTransform = function () {
      return new Transform({
        transform: function (chunk, encoding, callback) {
          callback(null, chunk)
        },
      })
    }
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
// const flowEnc = new FlowEnc('abc1234')
// const encode = flowEnc.encodeData('测试的明文加密1234￥%#')
// const decode = flowEnc.decodeData(encode)
// console.log('@@@decode', encode, decode.toString())
export default FlowEnc
