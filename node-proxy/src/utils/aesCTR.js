import crypto from 'crypto'
import { Transform } from 'stream'

class AesCTR {
  constructor(password, sizeSalt) {
    this.password = password
    this.sizeSalt = sizeSalt + ''
    this.passwdOutward = password
    // check base64
    if (password.length !== 32) {
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

  // 安全整数 2⁵³‑1（9007199254740991），否则出问题
  incrementIV2(counter, blocks) {
    const result = new Uint8Array(counter)
    let carry = blocks
    // i从最低字节(15)到高字节(8)
    for (let i = 15; i >= 8 && carry > 0; i--) {
      const sum = result[i] + carry
      result[i] = sum & 0xff
      carry = Math.floor(sum / 256)
    }
    // carry>0代表uint64溢出，CTR不安全
    if (carry > 0) throw new Error('CTR counter uint64 overflow')
    return result
  }

  // 这个算法也是正确的，限制blocks < 2^53，实测比较大都正确
  incrementIV3(counter, blocks) {
    const result = new Uint8Array(counter)
    let carry = blocks
    // 只迭代 counter域：索引15 ~ 8，不碰nonce(0‑7)
    for (let index = 15; index >= 8 && carry > 0; index--) {
      const sum = result[index] + (carry % 256)
      result[index] = sum & 0xff
      carry = Math.floor(carry / 256) + Math.floor(sum / 256)
    }
    // carry > 0 → uint64 counter溢出，CTR不允许，抛异常
    if (carry > 0) {
      throw new Error('AES‑CTR uint64 counter overflow, insecure')
    }
    return result
  }

  // 这个算法正确，支持超大大数
  incrementIV64(counter, blocks) {
    const res = new Uint8Array(counter)
    const dv = new DataView(res.buffer)
    let val = dv.getBigUint64(8, false)
    val += BigInt(blocks)
    dv.setBigUint64(8, val, false)
    return res
  }
}

export default AesCTR
