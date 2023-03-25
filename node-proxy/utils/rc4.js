'use strict'

import crypto from 'crypto'
import { Transform } from 'stream'
// import PRGAExcuteThread from './PRGAThread.js'
import PRGAExcuteThread from './PRGAThread.js'

/**
 * RC4算法，安全性相对好很多
 * 可以对 512345678进行 缓存计算节点，这样下次就可以不用计算那么大
 */
class Rc4 {
  // password，salt: 一般用文件的长度作为salt，确保每个文件密码流不一样
  constructor(password, sizeSalt) {
    if (!sizeSalt) {
      throw new Error('salt is null')
    }
    this.password = password
    // 对外的文件夹密码，可用于分享作用
    this.passwdOutward = password
    if (password.length !== 32) {
      this.passwdOutward = crypto.createHash('md5').update(password).digest('hex')
    }
    // 加入盐
    const passwdSalt = this.passwdOutward + sizeSalt
    // fileHexKey: 实际文件密码，可用于分享作用
    this.fileHexKey = crypto.createHash('md5').update(passwdSalt).digest('hex')
    // 开始初始化
    const seedKeyBuf = Buffer.from(this.fileHexKey, 'hex')
    this.position = 0
    this.i = 0
    this.j = 0
    this.sbox = []
    this.initKSA(seedKeyBuf)
    // 获取128长度的key
    const randomKey = []
    this.PRGAExcute(128, (random) => {
      randomKey.push(random)
    })
    this.realRc4Key = Buffer.from(randomKey)
    // 真正的初始化
    this.initKSA(this.realRc4Key)
  }

  // 重置sbox，i，j，数量太大的话，建议使用下面的异步线程
  setPosition(position = 0) {
    this.position = position * 1
    this.initKSA(this.realRc4Key)
    // 初始化长度，执行一遍就好
    this.PRGAExcute(this.position, () => {})
    return this
  }

  async setPositionAsync(position = 0) {
    this.position = position * 1
    // 初始化
    this.initKSA(this.realRc4Key)
    // 初始化长度，执行一遍就好
    const data = await PRGAExcuteThread(this)
    const { sbox, i, j } = data
    this.sbox = sbox
    this.i = i
    this.j = j
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
    // 复用plainBuffer内存
    return plainBuffer
  }

  // 加密流转换
  encryptTransform() {
    return new Transform({
      // 匿名函数确保this是指向本实例
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
