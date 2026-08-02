import { Transform } from 'stream'
import crypto from 'crypto'
/**
 *
 * @param {Uint8Array} key
 * @param {Uint8Array} nonce
 * @param {number} counter
 * @throws {Error}
 *
 * @constructor
 */
// ChaCha20 纯JS实现（无依赖）
class ChaCha20 {
  constructor(password, sizeSalt, counter) {
    // 用于测试验证，chacha算法
    if (typeof counter === 'number') {
      return this._constructor(password, sizeSalt, counter)
    }
    this.password = password
    this.sizeSalt = sizeSalt + ''
    // share you folder passwdOutward safety
    this.passwdOutward = password
    if (password.length !== 32) {
      // add 'CHA20' as salt
      this.passwdOutward = crypto.pbkdf2Sync(this.password, 'CHA20', 1000, 16, 'sha256').toString('hex')
    }
    // add salt
    const passwdSalt = this.passwdOutward + sizeSalt
    // fileHexKey: file passwd，could be share
    const passwdKey = crypto.createHash('sha256').update(passwdSalt).digest()
    const nonce = crypto.createHash('md5').update(this.sizeSalt).digest().subarray(0, 12)
    this._constructor(passwdKey, nonce)
  }
  // counter = 0，this.counter 代表加密的块
  _constructor(key, nonce, counter = 1) {
    if (!(key instanceof Uint8Array) || key.length !== 32) {
      throw new Error('Key should be 32 byte array!')
    }

    if (!(nonce instanceof Uint8Array) || nonce.length !== 12) {
      throw new Error('Nonce should be 12 byte array!')
    }
    // key: 32字节 Uint8Array
    // nonce: 12字节 Uint8Array (RFC8439标准)
    this.key = [...key]
    this.nonce = [...nonce]
    this.counter = counter
    this._bufPos = 0
    this._keystream = new Uint8Array(64)
  }

  _rotl(v, n) {
    return (v << n) | (v >>> (32 - n))
  }
  // 四分之一轮运算（核心）
  _qr(st, a, b, c, d) {
    st[a] = (st[a] + st[b]) >>> 0; st[d] = this._rotl(st[d] ^ st[a], 16)
    st[c] = (st[c] + st[d]) >>> 0; st[b] = this._rotl(st[b] ^ st[c], 12)
    st[a] = (st[a] + st[b]) >>> 0; st[d] = this._rotl(st[d] ^ st[a], 8)
    st[c] = (st[c] + st[d]) >>> 0; st[b] = this._rotl(st[b] ^ st[c], 7)
  }

  // 生成密钥流块
  _block() {
    // 先++ 方便计数
    const st = [
      0x61707865,
      0x3320646e,
      0x79622d32,
      0x6b206574, // 常量 "expand 32-byte k"
      ...this._bytesToUint32(this.key), // 32字节key → 8个u32
      this.counter, // 计数器
      ...this._bytesToUint32(this.nonce), // 12字节nonce → 3个u32
    ]
    // 注意不能this.counter = this.counter++ >>> 0, error
    this.counter = (this.counter + 1) >>> 0
    if (this.counter == 0) {
      // 达到256G，调整once
      const bt = this._bytesToUint32(this.nonce)
      bt[2] = (bt[2] + 1) >>> 0
      this._uint32ToBytes(bt, this.nonce)
    }
    const x = [...st]
    // 20轮 = 10次双轮
    for (let i = 0; i < 10; i++) {
      this._qr(x, 0, 4, 8, 12)
      this._qr(x, 1, 5, 9, 13)
      this._qr(x, 2, 6, 10, 14)
      this._qr(x, 3, 7, 11, 15)
      this._qr(x, 0, 5, 10, 15)
      this._qr(x, 1, 6, 11, 12)
      this._qr(x, 2, 7, 8, 13)
      this._qr(x, 3, 4, 9, 14)
    }
    for (let i = 0; i < 16; i++) x[i] = (x[i] + st[i]) >>> 0
    this._uint32ToBytes(x, this._keystream)
    // 重置0
    this._bufPos = 0
    return this._keystream
  }

  // 加密/解密（异或运算，两者通用）
  update(data) {
    const out = new Uint8Array(data.length)
    let pos = 0
    while (pos < data.length) {
      const len = Math.min(64, data.length - pos)
      for (let i = 0; i < len; i++) {
        if (this._bufPos % 64 === 0) {
          this._block()
        }
        out[pos + i] = data[pos + i] ^ this._keystream[this._bufPos++]
      }
      pos += len
    }
    return out
  }

  encrypt(messageBytes) {
    return this.update(messageBytes)
  }

  decrypt(messageBytes) {
    return this.update(messageBytes)
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

  // 保持跟接口类型一致，异步执行
  async setPositionAsync(position) {
    this.setPosition(position)
  }

  setPosition(position) {
    // 重置counter和_bufPos
    this.counter = Math.floor(position / 64) + 1
    // 空跑偏移量也可以
    this._bufPos = 0
    this.update(new Uint8Array(position % 64))
    // 下面的也可以
    // this._block()
    // this._bufPos = position % 64
  }

  /**
   * 将 Uint8Array 转换为 Uint32Array (小端序) ，地位靠前
   * @param {buf} bytes
   * @returns {Uint32Array}
   */
  _bytesToUint32(buf) {
    const arr = new Uint32Array(buf.length / 4)
    for (let i = 0; i < arr.length; i++) {
      arr[i] = buf[i * 4] | (buf[i * 4 + 1] << 8) | (buf[i * 4 + 2] << 16) | (buf[i * 4 + 3] << 24)
    }
    return arr
  }

  _uint32ToBytes(u32, buf) {
    let pos
    for (let i = 0; i < u32.length; i++) {
      pos = i * 4
      buf[pos] = u32[i] & 0xff
      buf[pos + 1] = (u32[i] >>> 8) & 0xff
      buf[pos + 2] = (u32[i] >>> 16) & 0xff
      buf[pos + 3] = (u32[i] >>> 24) & 0xff
    }
  }
}

export default ChaCha20

// 代码测试
// const key = new Uint8Array(32).fill(1) // 演示用密钥
// const nonce = new Uint8Array(12).fill(2) // 演示用Nonce
// // 2. 明文
// const plaintext = new TextEncoder().encode('Hello Chacha20!ok')
// // 3. 加密 counter = 1
// const cipher = new ChaCha20(key, nonce, 1)
// const encrypted = cipher.update(plaintext)
// // 对比原生密码是否相同
// const cipherploy = crypto.createCipheriv('chacha20-poly1305', key, nonce, { authTagLength: 16 })
// let encrypted2 = cipherploy.update(plaintext, 'utf8', 'hex')
// encrypted2 += cipherploy.final('hex')
// console.log('Encrypted:', encrypted2, Buffer.from(encrypted).toString('hex'))
// // 测试中间开始解密
// const sliced = encrypted.slice(6, 15)
// console.log('密文段：', sliced)
// const decipher = new ChaCha20(key, nonce, 0)
// decipher.setPosition(6)
// const decrypted = decipher.update(sliced)
// console.log('明文段:', new TextDecoder().decode(decrypted))
