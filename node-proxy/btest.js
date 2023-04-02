import crypto from 'crypto'
import JSSalsa20 from './src/utils/JSSalsa20.js'
import ChaCha20 from './src/utils/ChaCha20.js'

import { XMLParser } from 'fast-xml-parser'

const decipher = crypto.createDecipheriv('rc4', 'MY SECRET KEY', '')

const text = 'HELL我的的O'
let decrypted = decipher.update(text, 'utf8', 'hex')
const hex = decipher.final('hex')
// decrypted += hex
console.log('@@@@' + hex, hex, decrypted)

const key = crypto.randomBytes(32)

function encChaPoly(key, data, cb) {
  try {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('chacha20-poly1305', key, iv, {
      authTagLength: 16,
    })
    const encrypted = Buffer.concat([cipher.update(Buffer.from(data), 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    const final = Buffer.concat([iv, tag, encrypted]).toString('hex')
    cb(false, final)
  } catch (err) {
    if (err) {
      cb(err, null)
    }
  }
}

function decChaPoly(key, data, cb) {
  try {
    const decipher = crypto.createDecipheriv('chacha20-poly1305', key, Buffer.from(data.substring(0, 24), 'hex'), {
      authTagLength: 16,
    })
    decipher.setAuthTag(Buffer.from(data.substring(24, 56), 'hex'))
    decrypted = [decipher.update(Buffer.from(data.substring(56), 'hex'), 'binary', 'utf8'), decipher.final('utf8')].join('')
    cb(false, decrypted)
  } catch (err) {
    if (err) {
      cb(err, null)
    }
  }
}

encChaPoly(key, text, function (err, res) {
  if (err) {
    return console.log(err)
  }
  console.log('@@@encChaPoly', res)
  decChaPoly(key, res, function (err, res) {
    if (err) {
      return console.log(err)
    }
    console.log('@@@decChaPoly', res)
  })
})

const keyBuffer = new Uint8Array(32)
for (let i = 0; i < 32; i++) {
  keyBuffer[i] = i
}
const nonceBuffer = new Uint8Array(12)
for (let i = 0; i < 12; i++) {
  nonceBuffer[i] = i
}

const salsa = new ChaCha20(keyBuffer, nonceBuffer, 0)
const enc = salsa.encrypt(nonceBuffer)
console.log(enc)
