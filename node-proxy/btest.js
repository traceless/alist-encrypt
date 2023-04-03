import crypto from 'crypto'
import ChaCha20 from './src/utils/chaCha20.js'
import Rc4 from './src/utils/rc4.js'
import ChaCha20Poly from './src/utils/chaCha20Poly.js'

let decrypted = null
const iv = crypto.pbkdf2Sync('123456', 'salt', 5, 12, 'sha512')
const keyenc = crypto.pbkdf2Sync('123456', 'salt', 1, 32, 'sha512')

const rc4System = crypto.createCipheriv('rc4', 'MY SECRET KEY', '')
const decipher = crypto.createDecipheriv('rc4', 'MY SECRET KEY', '')
decrypted = rc4System.update(Buffer.from('test rc4 encrypt'), 'binary', 'hex')
// decrypted += encipher.final('hex')
console.log('@@@@', decrypted, decipher.update(decrypted, 'hex', 'utf8'))

const chaCha20System = new ChaCha20Poly(keyenc, iv)
const chaCha20Local = new ChaCha20(keyenc, iv)

const rc4Local = new Rc4('1234', 33)
const textPlain =
  '123412舞蹈服士士大夫无法大夫我的士我的地1234方的大蹈服士士大夫无法对方文舞蹈服士士大夫无法对方文说道士大夫士大蹈服士士大夫无法对方文舞蹈服士士大夫无法对方文说道士大夫士大蹈服士士大夫无法对方文舞蹈服士士大夫无法对方文说道士大夫士大蹈服士士大夫无法对方文对方文说道士大夫士大蹈服士士大夫无法对方文说道士大夫士大夫对方士大蹈服士士大夫无法对方文说道士大夫士大夫对方士大蹈服士士大夫无法对方文说道士大夫士大夫对方士大蹈服士士大夫无法对方文说道士大夫士大夫对方士大夫对方士大夫无法对方文说道士大夫士大夫对方士大夫无法对方文说道士大夫士大夫对方士大夫无法对方文说道士大夫士大夫对方士大夫无法对方文说道士大夫士大夫对方大夫无法对方文说道士大夫士大夫对方士大夫第三方第三方士大夫士大夫士大夫士大夫342134'
const textBuf = Buffer.from(textPlain)
console.log('@textBuf.length', textBuf.length)

const startDate = Date.now()
for (let i = 0; i < 523456; i++) {
  // chaCha20Local.encrypt(textBuf)
  // rc4Local.encrypt(textBuf)
  // chaCha20System.encChaPoly(textBuf)
  // rc4System.update(textBuf, 'binary')
}
const cipher = crypto.createCipheriv('chacha20-poly1305', keyenc, iv, {
  authTagLength: 16,
})

let data = cipher.update('cesdd', 'utf8')
console.log('@@@@@@cipher', JSON.stringify(cipher))

const cipher22 = crypto.createCipheriv('chacha20-poly1305', keyenc, iv, {
  authTagLength: 16,
})


const buf = Buffer.from('folder13额的NameEnc')
let ff = 0
for (const bytes of buf) {
  ff+=bytes
}
console.log(ff)

const startPosition = Date.now()
// chaCha20Local.setPosition(12345678)
// rc4Local.setPosition(123456788)
// console.log('startPosition time: ' + (Date.now() - startPosition))

// rc4Local.setPositionAsync(523456024).then((res) => {
//   console.log('rc4 startPosition async time: ' + (Date.now() - startPosition))
// })

console.log('end', 'time: ' + (Date.now() - startDate))
