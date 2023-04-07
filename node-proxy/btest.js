import crypto from 'crypto'
import path from 'path'

import ChaCha20 from './src/utils/chaCha20.js'
import ChaCha20Poly from './src/utils/chaCha20Poly.js'
import { chownSync, copyFileSync } from 'fs'
import CRCN from './src/utils/crc6-8.js'

const crc6 = new CRCN(8)

const byteBuf = Buffer.from('abcd')

const checksum = crc6.checksum(byteBuf)
console.log(byteBuf, checksum & 0xff)
