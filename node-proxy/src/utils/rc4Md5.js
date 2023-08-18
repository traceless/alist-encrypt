'use strict'

import crypto from 'crypto'
import { Transform } from 'stream'
import PRGAExcuteThread from './PRGAThread'

/**
 * RC4算法，安全性相对好很多
 * 可以对 312345678 进行缓存sbox节点，这样下次就可以不用计算那么大
 */
// Reset sbox every 100W bytes
const segmentPosition = 100 * 10000

class Rc4Md5 {
  // password，salt: ensure that each file has a different password
  constructor(password, sizeSalt) {
    if (!sizeSalt) {
      throw new Error('salt is null')
    }
    this.position = 0
    this.i = 0
    this.j = 0
    this.sbox = []
    this.password = password
    this.sizeSalt = sizeSalt
    // share you folder passwdOutward safety
    this.passwdOutward = password
    // check base64，create passwdOutward
    if (password.length !== 32) {
      this.passwdOutward = crypto.pbkdf2Sync(this.password, 'RC4', 1000, 16, 'sha256').toString('hex')
    }
    // add salt
    const passwdSalt = this.passwdOutward + sizeSalt
    // fileHexKey: file passwd，could be share
    this.fileHexKey = crypto.createHash('md5').update(passwdSalt).digest('hex')
    this.resetKSA()
  }

  resetKSA() {
    const offset = parseInt(this.position / segmentPosition) * segmentPosition
    const buf = Buffer.alloc(4)
    buf.writeInt32BE(offset)
    const rc4Key = Buffer.from(this.fileHexKey, 'hex')
    let j = rc4Key.length - buf.length
    for (let i = 0; i < buf.length; i++, j++) {
      rc4Key[j] = rc4Key[j] ^ buf[i]
    }
    this.initKSA(rc4Key)
  }

  // reset sbox，i，j
  setPosition(newPosition = 0) {
    newPosition *= 1
    this.position = newPosition
    this.resetKSA()
    // use PRGAExecPostion no change potision
    this.PRGAExecPostion(newPosition % segmentPosition)
    return this
  }

  // reset sbox，i，j, in other thread
  async setPositionAsync(newPosition = 0) {
    // return this.setPosition(newPosition)
    newPosition *= 1
    this.position = newPosition
    this.resetKSA()
    const { sbox, i, j } = this
    const data = await PRGAExcuteThread({ sbox, i, j, position: newPosition % segmentPosition })
    this.sbox = data.sbox
    this.i = data.i
    this.j = data.j
    return data
  }

  encryptText(plainTextLen) {
    const plainBuffer = Buffer.from(plainTextLen)
    return this.encrypt(plainBuffer)
  }

  // 加解密都是同一个方法
  encrypt(plainBuffer) {
    return this.PRGAExcute(plainBuffer)
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
  PRGAExcute(plainBuffer) {
    let { sbox: S, i, j } = this
    for (let k = 0; k < plainBuffer.length; k++) {
      i = (i + 1) % 256
      j = (j + S[i]) % 256
      // swap
      const temp = S[i]
      S[i] = S[j]
      S[j] = temp
      plainBuffer[k] ^= S[(S[i] + S[j]) % 256]
      if (++this.position % segmentPosition === 0) {
        // reset sbox initKSA
        this.resetKSA()
        i = this.i
        j = this.j
        S = this.sbox
      }
    }
    // save the i,j
    this.i = i
    this.j = j
    return plainBuffer
  }

  PRGAExecPostion(plainLen) {
    let { sbox: S, i, j } = this
    // k-- is inefficient
    for (let k = 0; k < plainLen; k++) {
      i = (i + 1) % 256
      j = (j + S[i]) % 256
      const temp = S[i]
      S[i] = S[j]
      S[j] = temp
    }
    this.i = i
    this.j = j
  }

  initKSA(key) {
    const K = []
    //  init sbox
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

export default Rc4Md5
