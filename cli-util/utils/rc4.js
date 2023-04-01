'use strict'

import crypto from 'crypto'
import { Transform } from 'stream'

/**
 * RC4算法，安全性相对好很多
 * 可以对 512345678进行 缓存计算节点，这样下次就可以不用计算那么大
 */
class Rc4 {
  // password，salt: ensure that each file has a different password
  constructor(password, sizeSalt) {
    if (!sizeSalt) {
      throw new Error('salt is null')
    }
    this.password = password
    this.sizeSalt = sizeSalt
    // share you folder passwdOutward safety
    this.passwdOutward = password
    if (password.length !== 32) {
      // add 'RC4' as salt
      const sha256 = crypto.createHash('sha256')
      const key = sha256.update(password + 'RC4').digest('hex')
      this.passwdOutward = crypto.createHash('md5').update(key).digest('hex')
    }
    // add salt
    const passwdSalt = this.passwdOutward + sizeSalt
    // fileHexKey: file passwd，can be share
    this.fileHexKey = crypto.createHash('md5').update(passwdSalt).digest('hex')
    // get seedKey
    const seedKeyBuf = Buffer.from(this.fileHexKey, 'hex')
    this.position = 0
    this.i = 0
    this.j = 0
    this.sbox = []
    this.initKSA(seedKeyBuf)
    // get 128 length key
    const randomKey = []
    this.PRGAExcute(128, (random) => {
      randomKey.push(random)
    })
    this.realRc4Key = Buffer.from(randomKey)
    // last init
    this.initKSA(this.realRc4Key)
  }

  // reset sbox，i，j
  setPosition(newPosition = 0) {
    newPosition *= 1
    this.position = newPosition
    this.initKSA(this.realRc4Key)
    // init position
    this.PRGAExcute(this.position, () => {})
    return this
  }

  encryptText(plainTextLen) {
    const plainBuffer = Buffer.from(plainTextLen)
    return this.encrypt(plainBuffer)
  }

  // 加解密都是同一个方法
  encrypt(plainBuffer) {
    let index = 0
    this.PRGAExcute(plainBuffer.length, (random) => {
      plainBuffer[index] = random ^ plainBuffer[index++]
    })
    return plainBuffer
  }

  // 加密流转换
  encryptTransform() {
    return new Transform({
      // use anonymous func make sure `this` point to rc4
      transform: (chunk, encoding, next) => {
        next(null, this.encrypt(chunk))
      },
    })
  }

  decryptTransform() {
    // 解密流转换，不能单实例
    return new Transform({
      transform: (chunk, encoding, next) => {
        // this.push()  用push也可以
        next(null, this.encrypt(chunk))
      },
    })
  }

  // 初始化长度，因为有一些文件下载 Range: bytes=3600-5000
  PRGAExcute(plainLen, callback) {
    let { sbox: S, i, j } = this
    for (let k = 0; k < plainLen; k++) {
      i = (i + 1) % 256
      j = (j + S[i]) % 256
      // swap
      const temp = S[i]
      S[i] = S[j]
      S[j] = temp
      // 产生伪随机
      callback(S[(S[i] + S[j]) % 256])
    }
    // 记录位置，下次继续伪随机
    this.i = i
    this.j = j
  }

  // KSA初始化sbox，key长度为128比较好？
  initKSA(key) {
    const K = []
    //  对S表进行初始赋值
    for (let i = 0; i < 256; i++) {
      this.sbox[i] = i
    }
    //  用种子密钥对K表进行填充
    for (let i = 0; i < 256; i++) {
      K[i] = key[i % key.length]
    }
    //  对S表进行置换
    for (let i = 0, j = 0; i < 256; i++) {
      j = (j + this.sbox[i] + K[i]) % 256
      const temp = this.sbox[i]
      this.sbox[i] = this.sbox[j]
      this.sbox[j] = temp
    }
    this.i = 0
    this.j = 0
  }
}

// const rc4 = new Rc4('123456')
// const buffer = rc4.encryptText('abc')
// // 要记得重置
// const plainBy = rc4.resetSbox().encrypt(buffer)
// console.log('@@@', buffer, Buffer.from(plainBy).toString('utf-8'))

export default Rc4
