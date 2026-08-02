import crypto from 'crypto'
import { pathToRegexp } from 'path-to-regexp'
import path from 'path'
import { chownSync, copyFileSync } from 'fs'
import aesCTR from '@/utils/aesCTR'
import { crc32, crc8, crc16 } from '@/utils/crcn'

import base64url from '@/utils/base64url'

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
const strText = '12阿道夫阿adfadf adf23r123r 道夫3阿斯顿发斯蒂芬41'
const strBytes = Buffer.from(strText, 'utf8') // 2字节
const aesctr = new aesCTR(passwd, strBytes.length)
const aseencbur = aesctr.encrypt(strBytes)
const utf8data = Buffer.from(strText, 'utf-8')

const dd = base64url.encode(strText)
const buf = base64url.decode(dd)

// console.log('@@1233232', dd, Buffer.from(strText).toString('base64'), Buffer.from(buf).toString('utf8'))


const base64UrlCode = encodeName2(passwd, 'chacha20', strText)
const strDecode = decodeName(passwd, 'chacha20', base64UrlCode)
console.log('@@base64UrlCode  ', base64UrlCode, strDecode)