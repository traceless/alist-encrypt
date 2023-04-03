import crypto from 'crypto'

class ChaCha20Poly {
  constructor(key, iv) {
    this.key = key
    this.iv = iv
    this.cipher = crypto.createCipheriv('chacha20-poly1305', this.key, iv, {
      authTagLength: 16,
    })
    this.decipher = crypto.createDecipheriv('chacha20-poly1305', this.key, iv, {
      authTagLength: 16,
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
      if (authTag === false) {
        return Buffer.concat([this.decipher.update(bufferData), this.decipher.final()]).toString('utf8')
      }
      this.decipher.setAuthTag(this.cipher.getAuthTag())
      if (typeof authTag === 'string') {
        this.decipher.setAuthTag(authTag)
      }
      const decryptData = Buffer.concat([this.decipher.update(bufferData), this.decipher.final()]).toString('utf8')
      return decryptData
    } catch (err) {
      console.log(err)
    }
  }
}

export default ChaCha20Poly
