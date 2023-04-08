import crypto from 'crypto'
import { Transform } from 'stream'

class ChaCha20Poly {
  constructor(password, sizeSalt) {
    this.password = password
    this.sizeSalt = sizeSalt
    // share you folder passwdOutward safety
    this.passwdOutward = password
    if (password.length !== 32) {
      // add 'RC4' as salt
      const sha256 = crypto.createHash('sha256')
      const key = sha256.update(password + 'CHA20').digest('hex')
      this.passwdOutward = crypto.createHash('md5').update(key).digest('hex')
    }
    // add salt
    const passwdSalt = this.passwdOutward + sizeSalt
    // fileHexKey: file passwd，could be share
    const fileHexKey = crypto.createHash('sha256').update(passwdSalt).digest()
    const iv = crypto.pbkdf2Sync(this.passwdOutward, sizeSalt + '', 10000, 12, 'sha256')
    this.cipher = crypto.createCipheriv('chacha20-poly1305', fileHexKey, iv, {
      authTagLength: 16,
    })
    this.decipher = crypto.createDecipheriv('chacha20-poly1305', fileHexKey, iv, {
      authTagLength: 16,
    })
  }

  async cachePosition() {
    console.log('cachePosition the chacha20 ')
  }

  async setPositionAsync(_position) {
    const buf = Buffer.alloc(1024)
    const position = parseInt(_position / 1024)
    const mod = _position % 1024
    for (let i = 0; i < position; i++) {
      this.decChaPoly(buf)
    }
    const modBuf = Buffer.alloc(mod)
    for (let i = 0; i < mod; i++) {
      this.decChaPoly(modBuf)
    }
  }

  encryptTransform() {
    return new Transform({
      transform: (chunk, encoding, next) => {
        next(null, this.encChaPoly(chunk))
      },
    })
  }

  decryptTransform() {
    return new Transform({
      transform: (chunk, encoding, next) => {
        next(null, this.decChaPoly(chunk, false))
      },
    })
  }

  encChaPoly(data) {
    if (typeof data === 'string') {
      data = Buffer.from(data, 'utf8')
    }
    try {
      const encrypted = this.cipher.update(data)
      return encrypted
    } catch (err) {
      console.log(err)
    }
  }

  encChaPolyFinal() {
    return this.cipher.final()
  }

  getAuthTag() {
    return this.cipher.getAuthTag()
  }

  decChaPoly(bufferData, authTag) {
    try {
      if (authTag) {
        this.decipher.setAuthTag(authTag)
      }
      if (authTag === true) {
        this.decipher.setAuthTag(this.cipher.getAuthTag())
      }
      if (typeof authTag === 'string') {
        this.decipher.setAuthTag(Buffer.from(authTag))
      }

      return this.decipher.update(bufferData)
      // const decryptData = Buffer.concat([this.decipher.update(bufferData), this.decipher.final()]).toString('utf8')
    } catch (err) {
      console.log(err)
    }
  }

  decChaPolyFinal() {
    try {
      this.decipher.final()
    } catch (err) {
      console.log(err)
    }
  }
}

export default ChaCha20Poly
