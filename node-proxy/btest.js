import crypto from 'crypto'
import ChaCha20 from './src/utils/chaCha20.js'
import AesCRT from './src/utils/aesCTR.js'
import ChaCha20Poly from './src/utils/chaCha20Poly.js'
import { chownSync, copyFileSync } from 'fs'

function incrementIV(iv, increment) {
  if (iv.length !== 16) throw new Error('Only implemented for 16 bytes IV')
  const MAX_UINT32 = 0xffffffff
  const incrementBig = ~~(increment / MAX_UINT32)
  const incrementLittle = (increment % MAX_UINT32) - incrementBig
  // split the 128bits IV in 4 numbers, 32bits each
  let overflow = 0
  for (let idx = 0; idx < 4; ++idx) {
    let num = iv.readUInt32BE(12 - idx * 4)
    let inc = overflow
    if (idx === 0) inc += incrementLittle
    if (idx === 1) inc += incrementBig
    num += inc
    const numBig = ~~(num / MAX_UINT32)
    const numLittle = (num % MAX_UINT32) - numBig
    overflow = numBig
    iv.writeUInt32BE(numLittle, 12 - idx * 4)
  }
}

const key = crypto.randomBytes(16)
const iv = crypto.randomBytes(16)

const message = 'Hello world! This is test message, designed to be encrypted and then decrypted,ust increment the IV, as if it was a big 128bits unsigned inust increment the IV, as if it was a big 128bits unsigned in'
const messageBytes = Buffer.from(message, 'utf8')
console.log('clear  text: @@@' + message)

const cipher = crypto.createCipheriv('aes-128-ctr', key, iv)
let cipherText = cipher.update(messageBytes)
cipherText = Buffer.concat([cipherText, cipher.final()])

// this is the interesting part: we just increment the IV, as if it was a big 128bits unsigned integer. The IV is now valid for decrypting block n°2, which corresponds to byte offset 32
incrementIV(iv, 2) // set counter to 2

const decipher = crypto.createDecipheriv('aes-128-ctr', key, iv)
let decrypted = decipher.update(cipherText.subarray(32)) // we slice the cipherText to start at byte 32
decrypted = Buffer.concat([decrypted, decipher.final()])
const decryptedMessage = decrypted.toString('utf8')
console.log('decrypt msg: @@@' + decryptedMessage)

// =============================================== test ===================================================================
const keyaes = crypto.createHash('md5').update('123456').digest()
const ivaes = Buffer.from('1234567891113332')
console.log('@@@ivaes', ivaes.length, keyaes.length)

const encCRT = new AesCRT(keyaes, ivaes)
const encByte = encCRT.encrypt(messageBytes)

const decCRT = new AesCRT(keyaes, ivaes)
decCRT.setPosition(45)
const plainBuf = decCRT.decrypt(encByte.subarray(45))
console.log('@@@decCRT', plainBuf.toString('utf8'))
