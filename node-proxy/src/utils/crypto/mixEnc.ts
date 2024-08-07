import crypto from 'crypto'
import { Transform } from 'stream'
import { logger } from '@/common/logger'

/**
 * 混淆算法，加密强度低，容易因为文件特征被破解。可以提升encode长度来对抗
 */
class MixEnc implements EncryptFlow {
  public password: string
  public passwdOutward: string

  private readonly encode: Buffer
  private readonly decode: Buffer

  constructor(password: string) {
    this.password = password
    // 说明是输入encode的秘钥，用于找回文件加解密
    this.passwdOutward = password
    // check base64
    if (password.length !== 32) {
      this.passwdOutward = crypto.pbkdf2Sync(this.password, 'MIX', 1000, 16, 'sha256').toString('hex')
    }

    const encode = crypto.createHash('sha256').update(this.passwdOutward).digest()
    const decode = []
    const length = encode.length
    const decodeCheck = {}

    for (let i = 0; i < length; i++) {
      const enc = encode[i] ^ i
      // 这里会产生冲突
      if (!decodeCheck[enc % length]) {
        decode[enc % length] = encode[i] & 0xff
        decodeCheck[enc % length] = encode[i]
      } else {
        for (let j = 0; j < length; j++) {
          if (!decodeCheck[j]) {
            encode[i] = (encode[i] & length) | (j ^ i)
            decode[j] = encode[i] & 0xff
            decodeCheck[j] = encode[i]
            break
          }
        }
      }
    }

    this.encode = encode
    this.decode = Buffer.from(decode)
  }

  async setPositionAsync(position: number) {
    logger.info('in the mix ', position)
    return this
  }

  // 加密方法
  encrypt(plainBuffer: Buffer) {
    for (let i = plainBuffer.length; i--; ) {
      plainBuffer[i] ^= this.encode[plainBuffer[i] % 32]
    }
    return plainBuffer
  }

  // 解密方法
  decrypt(encryptedBuffer: Buffer) {
    for (let i = encryptedBuffer.length; i--; ) {
      encryptedBuffer[i] ^= this.decode[encryptedBuffer[i] % 32]
    }
    return encryptedBuffer
  }

  // 加密流转换
  encryptTransform() {
    return new Transform({
      // 匿名函数确保this是指向 FlowEnc
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
        next(null, this.decrypt(chunk))
      },
    })
  }
}

export default MixEnc
