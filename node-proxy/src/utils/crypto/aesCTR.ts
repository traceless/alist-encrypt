import crypto from 'crypto'
import { Transform } from 'stream'

class AesCTR implements EncryptFlow {
  public password: string
  public passwdOutward: string

  private iv: Buffer
  private readonly sourceIv: Buffer
  private cipher: crypto.Cipher
  private readonly key: Buffer

  constructor(password: string, sizeSalt: string) {
    if (!sizeSalt) {
      throw new Error('salt is null')
    }

    this.password = password
    // check base64
    if (password.length !== 32) {
      this.passwdOutward = crypto.pbkdf2Sync(this.password, 'AES-CTR', 1000, 16, 'sha256').toString('hex')
    }

    // create file aes-ctr key
    this.key = crypto
      .createHash('md5')
      .update(this.passwdOutward + sizeSalt)
      .digest()
    this.iv = crypto.createHash('md5').update(sizeSalt).digest()

    // copy to sourceIv
    this.sourceIv = Buffer.alloc(this.iv.length)
    this.iv.copy(this.sourceIv)
    this.cipher = crypto.createCipheriv('aes-128-ctr', this.key, this.iv)
  }

  incrementIV(increment: number) {
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

  // reset position
  async setPositionAsync(position: number) {
    const ivBuffer = Buffer.alloc(this.sourceIv.length)
    this.sourceIv.copy(ivBuffer)
    this.iv = ivBuffer
    this.incrementIV(position / 16)
    //  create new Cipheriv
    this.cipher = crypto.createCipheriv('aes-128-ctr', this.key, this.iv)
    const buffer = Buffer.alloc(position % 16)
    this.encrypt(buffer)

    return this
  }

  encrypt(plainBuffer: Buffer) {
    return this.cipher.update(plainBuffer)
  }

  decrypt(encryptedBuffer: Buffer) {
    return this.cipher.update(encryptedBuffer)
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
}

export default AesCTR
