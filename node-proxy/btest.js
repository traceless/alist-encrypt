import crypto from 'crypto'
import path from 'path'

import ChaCha20Poly from './src/utils/chaCha20Poly.js'
import { chownSync, copyFileSync } from 'fs'
import CRCN from './src/utils/crc6-8.js'
import fs from 'fs'
import { encodeName, decodeName } from './src/utils/commonUtil.js'

const encname = encodeName('1234', 'aesctr', '123456', 'rc4')

const decname = decodeName('1234', 'aesctr', 'dff_' + encname)

console.log(encname, decname)
