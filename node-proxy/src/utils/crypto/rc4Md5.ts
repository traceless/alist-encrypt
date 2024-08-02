import crypto from 'crypto'
import { Transform } from 'stream'
import PRGAExecuteThread from '@/utils/crypto/RPGA/PRGAThread'

/**
 * RC4算法，安全性相对好很多
 * 可以对 312345678 进行缓存sbox节点，这样下次就可以不用计算那么大
 */
// Reset sbox every 100W bytes
const segmentPosition = 100 * 10000

class Rc4Md5 implements EncryptFlow {
  public password: string
  public passwdOutward: string

  private i = 0
  private j = 0
  private position = 0
  private sbox: number[] = []

  private readonly fileHexKey: string

  // password，salt: ensure that each file has a different password
  constructor(password: string, sizeSalt: string) {
    if (!sizeSalt) {
      throw new Error('salt is null')
    }
    this.password = password
    // share you folder passwdOutward safety
    this.passwdOutward = password
    // check base64，create passwdOutward
    if (password.length !== 32) {
      this.passwdOutward = crypto.pbkdf2Sync(this.password, 'RC4', 1000, 16, 'sha256').toString('hex')
    }
    // add salt
    this.fileHexKey = crypto
      .createHash('md5')
      .update(this.passwdOutward + sizeSalt)
      .digest('hex')

    this.resetKSA()
  }

  resetKSA() {
    const offset = (this.position / segmentPosition) * segmentPosition
    const buf = Buffer.alloc(4)
    buf.writeInt32BE(offset)
    const rc4Key = Buffer.from(this.fileHexKey, 'hex')
    let j = rc4Key.length - buf.length
    for (let i = 0; i < buf.length; i++, j++) {
      rc4Key[j] = rc4Key[j] ^ buf[i]
    }
    this.initKSA(rc4Key)
  }

  initKSA(key: Buffer) {
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

  // 初始化长度，因为有一些文件下载 Range: bytes=3600-5000
  PRGAExecute(plainBuffer: Buffer) {
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

  // reset sbox，i，j, in other thread
  async setPositionAsync(newPosition = 0) {
    this.position = newPosition
    this.resetKSA()
    const { sbox, i, j } = this
    const data = await PRGAExecuteThread({ sbox, i, j, position: newPosition % segmentPosition })
    this.sbox = data.sbox
    this.i = data.i
    this.j = data.j

    return this
  }

  // 加解密都是同一个方法
  encrypt(plainBuffer: Buffer) {
    return this.PRGAExecute(plainBuffer)
  }

  decrypt(encryptedBuffer: Buffer) {
    return this.PRGAExecute(encryptedBuffer)
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
}

export default Rc4Md5
