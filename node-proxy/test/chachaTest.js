import crypto from 'crypto'
import ChaCha20 from '../src/utils/chaCha20.js'
import Rc4 from '../src/utils/rc4.js'
import ChaCha20Poly from '../src/utils/chaCha20Poly.js'
import AesCRT from '../src/utils/aesCRT.js'

let decrypted = null
const rc4System = crypto.createCipheriv('rc4', 'MY SECRET KEY', '')
const decipher = crypto.createDecipheriv('rc4', 'MY SECRET KEY', '')
decrypted = rc4System.update(Buffer.from('test rc4 encrypt'), 'binary', 'hex')
// decrypted += encipher.final('hex')
console.log('@@@@', decrypted, decipher.update(decrypted, 'hex', 'utf8'))

const iv = crypto.randomBytes(12)
const keyenc = crypto.randomBytes(32)

const keyaes = crypto.randomBytes(16)
const ivaes = crypto.randomBytes(16)
const chaCha20System = new ChaCha20Poly(keyenc, iv)
const chaCha20Local = new ChaCha20(keyenc, iv)
const rc4Local = new Rc4('1234', 33)
const aseCRTSystem = new AesCRT(keyaes, ivaes)

const textPlain = `test测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度
                    测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度
                    测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度
                    测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度
                    测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度
                    测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度
                    测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试性能速度-测试-`

const textBuf = Buffer.from(textPlain)
console.log('@textBuf.length', textBuf.length)

const startDate = Date.now()
for (let i = 0; i < 523456; i++) {
  // chaCha20Local.encrypt(textBuf)
  // rc4Local.encrypt(textBuf)
  // chaCha20System.encChaPoly(textBuf)
  aseCRTSystem.encrypt(textBuf)
}

const startPosition = Date.now()
// chaCha20Local.setPosition(12345678)
// rc4Local.setPosition(123456788)
// console.log('startPosition time: ' + (Date.now() - startPosition))

// rc4Local.setPositionAsync(523456024).then((res) => {
//   console.log('rc4 startPosition async time: ' + (Date.now() - startPosition))
// })

console.log('test time: ' + (Date.now() - startDate))
