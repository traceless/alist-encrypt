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

getWebdavFileInfo(
  'http://192.168.8.240:5244/dav/aliyun%E4%BA%91%E7%9B%98/atest/d%E5%AF%B9%E6%96%B9%E6%88%91testrclone/kline_d%2Bata12342%E6%AD%A3%E6%96%87%E7%9A%84%E7%9A%84%E5%89%AF%E6%9C%AC.txt',
  'Basic YWRtaW46WWl1Tkg3bHk='
).then((res) => {
  console.log(res)
})
const passwd = '12345'
const strText = '12阿道夫阿a距纳秒级别，百万循环才看得出微小差异；单次调用完全忽略。阿斯顿发斯蒂芬41'
const strBytes = Buffer.from(strText, 'utf8') // 2字节
const aesctr = new aesCTR(passwd, strBytes.length)
const aseencbur = aesctr.encrypt(strBytes)
const utf8data = Buffer.from(strText, 'utf-8')

const dd = base64url.encode(strText)
const buf = base64url.decode(dd)

const cjkStr = binToCjk(strBytes)
const decCjk = cjkToBin(cjkStr)
console.log('@@cjkStr ', cjkStr, ' souce:', decCjk.toString('utf-8'))

// console.log('@@1233232', dd, Buffer.from(strText).toString('base64'), Buffer.from(buf).toString('utf8'))

const dddd = '婌粙烿瞁狹桊綦暿智她薞袳蟩蜮泪痥瀪賻耳疙綹妈涖貪蟣磾栦寧產豛衟率粹槪視纏蝭裮擲僯紦豘著璬発夈嶞抨蝫盎搖盥緯汹撗熀溺枋趚撯表槾搾忦玫貉堋皊礍丱上'
const base64UrlCode = encodeName2(passwd, 'chacha20', strText)
const strDecode = decodeName(passwd, 'chacha20', base64UrlCode)
console.log('@@base64UrlCode  ', base64UrlCode, strDecode)
