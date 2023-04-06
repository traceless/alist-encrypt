import crypto from 'crypto'
import { Transform } from 'stream'

class AesCRT {
  constructor(key, iv) {
    if (iv.length !== 16) throw new Error('Only implemented for 16 bytes IV')
    this.key = key
    const ivBuffer = Buffer.alloc(iv.length)
    iv.copy(ivBuffer)
    this.soureIv = ivBuffer
    console.log('@@@this.soureIv', iv, this.soureIv)
    this.iv = iv
    this.cipher = crypto.createCipheriv('aes-128-ctr', key, iv)
  }

  encrypt(messageBytes) {
    return this.cipher.update(messageBytes)
  }

  decrypt(messageBytes) {
    return this.cipher.update(messageBytes)
  }

  // reset position
  async setPosition(position) {
    console.log('@@#', this.soureIv)
    const ivBuffer = Buffer.alloc(this.soureIv.length)
    this.soureIv.copy(ivBuffer)
    this.iv = ivBuffer
    const increment = parseInt(position / 16)
    this.incrementIV(increment)
    //  create new Cipheriv
    this.cipher = crypto.createCipheriv('aes-128-ctr', this.key, this.iv)
    const offset = position % 16
    const buffer = Buffer.alloc(offset)
    console.log('@@@offset', offset)
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

export default AesCRT
