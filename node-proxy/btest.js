import crypto from 'crypto'
import { pathToRegexp } from 'path-to-regexp'
import path from 'path'
import { chownSync, copyFileSync } from 'fs'
import aesCTR from '@/utils/aesCTR'
import fs from 'fs'
import { encodeName, decodeName } from '@/utils/commonUtil'
import { getWebdavFileInfo } from '@/utils/webdavClient'

getWebdavFileInfo(
  'http://192.168.8.240:5244/dav/aliyun%E4%BA%91%E7%9B%98/atest/d%E5%AF%B9%E6%96%B9%E6%88%91testrclone/kline_d%2Bata12342%E6%AD%A3%E6%96%87%E7%9A%84%E7%9A%84%E5%89%AF%E6%9C%AC.txt',
  'Basic YWRtaW46WWl1Tkg3bHk='
).then((res) => {
  console.log(res)
})

console.log('@@dd', path.isAbsolute('/ddf'))
const content = 'fileInfoTable_/dav/aliyun%Evfnnz%BA%91%E7%9B%98/atest/12%E5%A4%A7%E5%A4%B4%E7%9A%84%E6%97%8F%E6%96%87%E4%BB%B6_8Xn78oZjs7VSr~qjdzVH4/4'

const reg = 'test'

const enw = content.replace(new RegExp(reg, 'g'), '@@')
console.log(enw)

const ext = ''.trim() || path.extname('/dfdf.df')

const encname = encodeName('123456', 'aesctr', '3wd.tex')

const decname = decodeName('123456', 'aesctr', encname)
console.log('##', ext, decname)


const path2 = "/var/test/abc/test/fold";

// 匹配 test/ 后面的所有内容（你要的就是这个）
const regex = "(test/.*)";
const match = path2.match(new RegExp(regex));

const result = match ? match[1] : null;
console.log('@@', result); // 输出：abc/test/fold

// 判断是否为匹配的路径
function pathExec(encPath, url) {
  for (const filePath of encPath) {
    const result = pathToRegexp(new RegExp(filePath)).exec(url)
    if (result) {
      console.log('@@@res', result)
      return result
    }
  }
  return null
}
const fileDate = new Uint8Array(32).fill(1)

const passwdOutward = crypto.pbkdf2Sync('12341234', 'AES-CTR', 1000, 16, 'sha256').toString('hex')
const passwdSalt = passwdOutward + '11164'
const key = crypto.createHash('md5').update(passwdSalt).digest()
const iv = crypto.createHash('md5').update('11164').digest()
const cipher = crypto.createCipheriv('aes-128-ctr', key, iv)
const encdata = cipher.update(fileDate)


console.log('====分隔符=====')
const utf8String = '🫠'
const buffer = Buffer.from(utf8String, 'utf8')
const gbkString = buffer.toString('utf16le')
console.log('gbkString:  ', gbkString, buffer.length)

const s = "围绕为稍等电风扇水岸东方阿第三方山东发斯蒂芬地方🫠";
const d2 = Buffer.from(s, 'utf8')// 2字节
const dd = new aesCTR('12341234', '11164')

const d = dd.encrypt(d2)
console.log('ue16 ', d.toString('utf16le'), d2)

// 文件名编码
function encodeFilename(name) {
  return Buffer.from(name, 'utf8').toString('base64url');
}

// 文件名解码
function decodeFilename(code) {
  return Buffer.from(code, 'base64url').toString('utf8');
}

console.log(encodeFilename("测去玩儿水电费艾师傅老地方试.txt"));
console.log(decodeFilename("5rWL6K+VLnR4dA"));
