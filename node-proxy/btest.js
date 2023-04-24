import crypto from 'crypto'
import path from 'path'
import { logger } from './src/common/logger.js'
import ChaCha20Poly from './src/utils/chaCha20Poly.js'
import { chownSync, copyFileSync } from 'fs'
import CRCN from './src/utils/crc6-8.js'
import fs from 'fs'
import { encodeName, decodeName } from './src/utils/commonUtil.js'
import { getWebdavFileInfo } from './src/utils/webdavClient.js'

getWebdavFileInfo(
  'http://192.168.8.240:5244/dav/aliyun%E4%BA%91%E7%9B%98/atest/d%E5%AF%B9%E6%96%B9%E6%88%91testrclone/kline_d%2Bata12342%E6%AD%A3%E6%96%87%E7%9A%84%E7%9A%84%E5%89%AF%E6%9C%AC.txt',
  'Basic YWRtaW46WWl1Tkg3bHk='
).then((res) => {
  console.log(res)
})

console.log('@@dd', path.isAbsolute('/ddf'))
const content = 'fileInfoTable_/dav/aliyun%Evfnnz%BA%91%E7%9B%98/atest/12%E5%A4%A7%E5%A4%B4%E7%9A%84%E6%97%8F%E6%96%87%E4%BB%B6_8Xn78oZjs7VSr~qjdzVH4/4'

console.log('@@content', decodeURIComponent(content))
const reg = 'test'

const enw = content.replace(new RegExp(reg, 'g'), '@@')
console.log(enw)

const ext = ''.trim() || path.extname('/dfdf.df')

const encname = encodeName('123456', 'aesctr', '3wd.tex')

const decname = decodeName('123456', 'aesctr', encname)
console.log('##', ext, decname)

logger.debug('dfeeeef')
