import crypto from 'crypto'
import { Transform } from 'stream'

class AesCTR {
  constructor(password, sizeSalt) {
    this.password = password
    this.sizeSalt = sizeSalt + ''
    // check base64
    if (Buffer.from(password, 'base64').toString('base64') === password) {
      this.passwdOutward = Buffer.from(password, 'base64').toString('hex')
    } else if (password.length !== 32) {
      this.passwdOutward = crypto.pbkdf2Sync(this.password, 'AES-CTR', 1000, 16, 'sha256').toString('hex')
    }
    // create file aes-ctr key
    const passwdSalt = this.passwdOutward + sizeSalt
    this.key = crypto.createHash('md5').update(passwdSalt).digest()
    this.iv = crypto.createHash('md5').update(this.sizeSalt).digest()
    // copy to soureIv
    const ivBuffer = Buffer.alloc(this.iv.length)
    this.iv.copy(ivBuffer)
    this.soureIv = ivBuffer
    this.cipher = crypto.createCipheriv('aes-128-ctr', this.key, this.iv)
  }

  encrypt(messageBytes) {
    return this.cipher.update(messageBytes)
  }

  decrypt(messageBytes) {
    return this.cipher.update(messageBytes)
  }

  // reset position
  async setPositionAsync(position) {
    const ivBuffer = Buffer.alloc(this.soureIv.length)
    this.soureIv.copy(ivBuffer)
    this.iv = ivBuffer
    const increment = parseInt(position / 16)
    this.incrementIV(increment)
    //  create new Cipheriv
    this.cipher = crypto.createCipheriv('aes-128-ctr', this.key, this.iv)
    const offset = position % 16
    const buffer = Buffer.alloc(offset)
    this.encrypt(buffer)
  }

  async cachePosition() {
    console.log('AesCRT cachePosition')
  }

  encryptTransform() {
    return new Transform({
      // use anonymous func make sure `this` point to rc4
      transform: (chunk, encoding, next) => {
        next(null, this.encrypt(chunk))
      },
    })
  }

  decryptTransform() {
    return new Transform({
      transform: (chunk, encoding, next) => {
        next(null, this.decrypt(chunk))
      },
    })
  }

  incrementIV(increment) {
    const MAX_UINT32 = 0xffffffff
    const incrementBig = ~~(increment / MAX_UINT32)
    const incrementLittle = (increment % MAX_UINT32) - incrementBig
    // split the 128bits IV in 4 numbers, 32bits each
    let overflow = 0
    for (let idx = 0; idx < 4; ++idx) {
      let num = this.iv.readUInt32BE(12 - idx * 4)
      let inc = overflow
      if (idx === 0) inc += incrementLittle
      if (idx === 1) inc += incrementBig
      num += inc
      const numBig = ~~(num / MAX_UINT32)
      const numLittle = (num % MAX_UINT32) - numBig
      overflow = numBig
      this.iv.writeUInt32BE(numLittle, 12 - idx * 4)
    }
  }
}

export default AesCTR
