import crypto from 'crypto'
import path from 'path'
import { logger } from './src/common/logger.js'
import ChaCha20Poly from './src/utils/chaCha20Poly.js'
import { chownSync, copyFileSync } from 'fs'
import CRCN from './src/utils/crc6-8.js'
import fs from 'fs'
import { encodeName, decodeName } from './src/utils/commonUtil.js'

const ext = ''.trim() || path.extname('/dfdf.df')

const encname = encodeName('123456', 'aesctr', '3wd.tex')

const decname = decodeName('123456', 'aesctr', encname)
console.log('##', ext, decname)

logger.debug('dfeeeef')
