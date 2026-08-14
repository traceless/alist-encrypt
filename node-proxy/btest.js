import crypto from 'crypto'
import { pathToRegexp } from 'path-to-regexp'
import path from 'path'
import { chownSync, copyFileSync } from 'fs'
import aesCTR from '@/utils/aesCTR'
import { crc32, crc8, crc16 } from '@/utils/crcn'

import base64url from '@/utils/base64url'
import { binToCjk, cjkToBin } from '@/utils/cjk-encode'

import fs from 'fs'
import { encodeName, decodeName, encodeName2, base64Decode } from '@/utils/commonUtil'
import { getWebdavFileInfo } from '@/utils/webdavClient'
import ChaCha20 from '@/utils/chacha20'

getWebdavFileInfo(
  'http://192.168.8.240:5244/dav/aliyun%E4%BA%91%E7%9B%98/atest/d%E5%AF%B9%E6%96%B9%E6%88%91testrclone/kline_d%2Bata12342%E6%AD%A3%E6%96%87%E7%9A%84%E7%9A%84%E5%89%AF%E6%9C%AC.txt',
  'Basic YWRtaW46WWl1Tkg3bHk='
).then((res) => {
  console.log(res)
})


const passwd = '1234567'
const strText = '12阿道夫阿a距纳秒级别，百万循环才看得出微小差异；单次调用完全忽略。阿斯顿发斯蒂芬41'
const strBytes = Buffer.from(strText, 'utf8') // 2字节
// 40393
const aesctr = new aesCTR(passwd, 40393)
console.log('@@aaase', aesctr.passwdOutward, aesctr.sizeSalt, aesctr.iv.toString('hex'))
const aseencbur = aesctr.encrypt(strBytes)
const utf8data = Buffer.from(strText, 'utf-8')

const dd = base64url.encode(strText)
const buf = base64url.decode(dd)

const cjkStr = binToCjk(strBytes)
const decCjk = cjkToBin(cjkStr)
console.log('@@cjkStr ', cjkStr, ' souce:', decCjk.toString('utf-8'))

// console.log('@@1233232', dd, Buffer.from(strText).toString('base64'), Buffer.from(buf).toString('utf8'))

const nonceIv = crypto.createHash('md5').update('12asdf345').digest()
const nonceIv1 = crypto.createHash('md5').update('12asdf345').digest()
const nonceIv2 = crypto.createHash('md5').update('12asdf345').digest()

const stats = fs.statSync('./test2zip.html');
console.log('@stats', stats.size)
const aesctrObj = new aesCTR(passwd, stats.size)
const chacha20 = new ChaCha20(passwd, stats.size)

const bufcjk = Buffer.alloc(98)
const dds = bufcjk.fill(1)

const dduni = new Uint8Array(14).fill(0)
dduni[13] = 13
dduni[12] = 2
console.log('@@@uni', dduni)

const dnew = Buffer.concat([bufcjk, dduni])
console.log('@@x', dnew.subarray(90, 112))

const ddcjk = binToCjk(dnew)
console.log('@@1', ddcjk, ddcjk.length)
const bindd = cjkToBin(ddcjk)
console.log('@@2', bindd.subarray(90, 112))

// console.log( await decodeName('12345', 'aesctr', 'L3Ga7dOMJv0-W9bxEIc4UX1yeMURlqCAzQhfiNDELGkZplRzpqs') )

const encname = decodeName('12345', 'aesctr', 'L3Ga7dOMJv0-W9bxEIc4UX1yeMURlqCAzQhfiNDELGkZplRzpqs')
console.log('@encname ', encname)