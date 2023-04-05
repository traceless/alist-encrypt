import crypto from 'crypto'
import ChaCha20 from './src/utils/chaCha20.js'
import Rc4 from './src/utils/rc4.js'
import ChaCha20Poly from './src/utils/chaCha20Poly.js'
import { chownSync } from 'fs'

let decrypted = null

const dd = '^d/test/*'

const exp = new RegExp(dd)

console.log(exp.exec('dd33/test/343'))
