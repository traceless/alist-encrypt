'use strict'

import crypto from 'crypto'
import { Transform } from 'stream'
// import PRGAExcuteThread from './PRGAThread.js'
import PRGAExcuteThread from './PRGAThread.js'

/**
 * RC4算法，安全性相对好很多
 */
class Rc4 {
  // password，position：伪随机开始位置
  constructor(password, position = 0) {
    this.password = password
    if (password.length !== 32) {
      this.password = crypto.createHash('md5').update(password).digest('hex')
    }
    this.passwordBuf = Buffer.from(this.password, 'hex')
    this.position = position * 1
    this.i = 0
    this.j = 0
    this.sbox = []
    this.setPosition(position)
  }

  // 重置sbox，i，j，数量太大的话，建议使用下面的异步线程
  setPosition(position = 0) {
    this.position = position * 1
    this.i = 0
    this.j = 0
    this.KSA(this.passwordBuf)
    // 初始化长度，执行一遍就好
    this.PRGAExcute(this.position, () => {})
    return this
  }

  async setPositionAsync(position = 0) {
    this.position = position * 1
    this.i = 0
    this.j = 0
    // 初始化
    this.KSA(this.passwordBuf)
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

  // key 128个字节比较好？
  KSA(key) {
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
    let j = 0
    for (let i = 0; i < 256; i++) {
      j = (j + this.sbox[i] + K[i]) % 256
      const temp = this.sbox[i]
      this.sbox[i] = this.sbox[j]
      this.sbox[j] = temp
    }
  }
}

// const rc4 = new Rc4('123456')
// const buffer = rc4.encryptText('abc')
// // 要记得重置
// const plainBy = rc4.resetSbox().encrypt(buffer)
// console.log('@@@', buffer, Buffer.from(plainBy).toString('utf-8'))

export default Rc4
