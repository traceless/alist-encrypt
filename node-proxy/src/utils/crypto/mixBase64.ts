import crypto from 'crypto'

const source = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-~+'

// use sha1 str to init

// 自定义的base64加密
class MixBase64 implements EncryptMethod {
  password: string
  passwdOutward: string

  private mapChars: Record<string, number> = {}

  private readonly chars: string[]

  constructor(password: string, salt = 'mix64') {
    const secret = password.length === 64 ? password : this.initKSA(password + salt)
    this.chars = secret.split('')
    this.chars.forEach((e, index) => {
      this.mapChars[e] = index
    })
    // 编码加密
  }

  initKSA(password: string) {
    const key = crypto.createHash('sha256').update(password).digest()
    const K = []
    // 对S表进行初始赋值
    const sbox = []
    const sourceKey = source.split('')
    //  对S表进行初始赋值
    for (let i = 0; i < source.length; i++) {
      sbox[i] = i
    }
    // 用种子密钥对K表进行填充
    for (let i = 0; i < source.length; i++) {
      K[i] = key[i % key.length]
    }
    // 对S表进行置换
    for (let i = 0, j = 0; i < source.length; i++) {
      j = (j + sbox[i] + K[i]) % source.length
      const temp = sbox[i]
      sbox[i] = sbox[j]
      sbox[j] = temp
    }
    let secret = ''
    for (const i of sbox) {
      secret += sourceKey[i]
    }
    return secret
  }

  static getSourceChar(index: number) {
    // 不能使用 = 号，url穿参数不支持
    return source.split('')[index]
  }

  encrypt(plainBuffer: Buffer) {
    let result = ''
    let arr: Buffer
    let bt: Buffer
    let char: string

    for (let i = 0; i < plainBuffer.length; i += 3) {
      if (i + 3 > plainBuffer.length) {
        arr = plainBuffer.subarray(i, plainBuffer.length)
        break
      }

      bt = plainBuffer.subarray(i, i + 3)
      char =
        this.chars[bt[0] >> 2] +
        this.chars[((bt[0] & 3) << 4) | (bt[1] >> 4)] +
        this.chars[((bt[1] & 15) << 2) | (bt[2] >> 6)] +
        this.chars[bt[2] & 63]
      result += char
    }

    if (plainBuffer.length % 3 === 1) {
      char = this.chars[arr[0] >> 2] + this.chars[(arr[0] & 3) << 4] + this.chars[64] + this.chars[64]
      result += char
    } else if (plainBuffer.length % 3 === 2) {
      char = this.chars[arr[0] >> 2] + this.chars[((arr[0] & 3) << 4) | (arr[1] >> 4)] + this.chars[(arr[1] & 15) << 2] + this.chars[64]
      result += char
    }

    return Buffer.from(result)
  }

  // 编码解密
  decrypt(encryptedBuffer: Buffer) {
    const base64Str = encryptedBuffer.toString()

    let size = (base64Str.length / 4) * 3
    let j = 0

    if (~base64Str.indexOf(this.chars[64] + '' + this.chars[64])) {
      size -= 2
    } else if (~base64Str.indexOf(this.chars[64])) {
      size -= 1
    }

    const buffer = Buffer.alloc(size)
    let enc1: number
    let enc2: number
    let enc3: number
    let enc4: number
    let i = 0
    while (i < base64Str.length) {
      enc1 = this.mapChars[base64Str.charAt(i++)]
      enc2 = this.mapChars[base64Str.charAt(i++)]
      enc3 = this.mapChars[base64Str.charAt(i++)]
      enc4 = this.mapChars[base64Str.charAt(i++)]
      buffer.writeUInt8((enc1 << 2) | (enc2 >> 4), j++)
      if (enc3 !== 64) {
        buffer.writeUInt8(((enc2 & 15) << 4) | (enc3 >> 2), j++)
      }
      if (enc4 !== 64) {
        buffer.writeUInt8(((enc3 & 3) << 6) | enc4, j++)
      }
    }
    return buffer
  }
}

export default MixBase64
