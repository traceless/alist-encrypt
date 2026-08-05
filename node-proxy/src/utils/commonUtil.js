import { pathToRegexp } from 'path-to-regexp'
import FlowEnc from './flowEnc'
import path from 'path'

import MixBase64 from './mixBase64'
import Crcn from './crc6-8'
import { cjkToBin, binToCjk } from './cjk-encode'
import { crc32 } from './crcn'
import base64Util from './base64url'
import { logger } from '@/common/logger'

const crc6 = new Crcn(6)
const origPrefix = 'orig_'
function isBadText(str) {
  // return /[ÃÂ�]/.test(str)
  return /[ÃÂ�¤§½]/.test(str)
}
/**
 * 判断字符串【全部字符】都在 U+4E00～U+9FFF
 * @param {string} str
 * @returns {boolean}
 */
function isCJKCode(str) {
  // ^ 开头 $ 结尾，整个字符串完全匹配；+ 至少1个字符，空字符串返回false
  return /^[\u4e00-\u9fff]+$/.test(str)
}

const chachaType = 'chacha20'
const source = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_~'
const getChar = function (index) {
  // 不能使用 = 号，url穿参数不支持
  return source.split('')[index]
}

// check file name, return real name
export function convertRealName(password, encType, pathText, encSuffix) {
  const fileName = path.basename(pathText)
  if (fileName.indexOf(origPrefix) === 0) {
    return fileName.replace(origPrefix, '')
  }
  // try encode name, fileName don't need decodeURI，encodeUrl func can't encode that like '(' '!'  in nodejs
  const ext = encSuffix || path.extname(fileName)
  const encName = encodeName(password, encType, fileName)
  console.log('@@decodeURI(fileName)', fileName, encName)
  return encName + ext
}

// 加密文件夹名字
export function convertRealFolderName(password, encType, pathText) {
  if (pathText.indexOf(origPrefix) === 0) {
    return pathText.replace(origPrefix, '')
  }
  // try encode name, fileName don't need decodeURI，encodeUrl func can't encode that like '(' '!'  in nodejs
  const encName = encodeName(password, encType, pathText)
  console.log('@@decodeURI(folderName)', encName)
  return encName
}

// if fileName or folderName has encrypt, return show name
export function convertShowName(password, encType, pathText) {
  const fileName = path.basename(pathText)
  const ext = path.extname(fileName)
  const encName = fileName.replace(ext, '')
  // encName don't need decodeURI
  let showName = decodeName(password, encType, encName)
  return showName === null ? origPrefix + fileName : showName
}

export function convertFilePath(passwdInfoOrList = {}, fpath, encOrDec = true) {
  let folderPath = fpath
  let passwdInfo = passwdInfoOrList
  let regExpRes = null
  if (Array.isArray(passwdInfoOrList)) {
    const { passwdInfo: data, regExpRes: result } = pathFindPasswd(passwdInfoOrList, folderPath)
    passwdInfo = data
    regExpRes = result
  } else if (passwdInfo?.encFolder) {
    // 重新计算
    for (const expPath of passwdInfo.encPath) {
      regExpRes = pathToRegexp(new RegExp(expPath)).exec(folderPath)
      if (regExpRes) {
        break
      }
    }
  }
  // 正常情况下regExpRes不会为null
  if (passwdInfo?.encFolder && regExpRes) {
    // const pathInfo = passwdInfo.result
    // 尝试解密路径，去掉第一个目录
    const foldNames = regExpRes[0].split('/')
    logger.info('@foldNames', regExpRes, foldNames)
    foldNames.shift()
    let encFoldPath = ''
    let realFoldPath = ''
    for (let name of foldNames) {
      // webdav 传进来的路径是 /dav/aliyun/encfolder/abc/, name = ''
      realFoldPath += '/'
      if (name !== '') {
        // 还原加密名字
        if (encOrDec) {
          realFoldPath += convertRealFolderName(passwdInfo.password, passwdInfo.encType, name)
        } else {
          realFoldPath += convertShowName(passwdInfo.password, passwdInfo.encType, name)
        }
      }
      encFoldPath += '/' + name
    }
    logger.info('@@@@foldPath', folderPath, encFoldPath, realFoldPath)
    folderPath = folderPath.replace(encFoldPath, realFoldPath)
  }
  return folderPath
}

export function convertShowPath(passwdInfoOrList = {}, fpath, encodeUri = false) {
  let folderPath = encodeUri ? decodeURI(fpath) : fpath
  folderPath = convertFilePath(passwdInfoOrList, folderPath, false)
  return encodeUri ? encodeURI(folderPath) : folderPath
}

export function convertRealPath(passwdInfoOrList = {}, fpath, encodeUri = false) {
  let folderPath = encodeUri ? decodeURI(fpath) : fpath
  folderPath = convertFilePath(passwdInfoOrList, folderPath, true)
  return encodeUri ? encodeURI(folderPath) : folderPath
}

// 判断是否为匹配的路径encPath:[]
export function pathExec(encPath, url) {
  for (const filePath of encPath) {
    const result = pathToRegexp(new RegExp(filePath)).exec(url)
    if (result) {
      return result
    }
  }
  return null
}
// 不允许加密乱码名字
export function encodeName2(password, encType, plainName) {
  const isBad = isBadText(plainName)
  if (isBad) {
    console.log('@isBadText', plainName)
  }
  const passwdOutward = FlowEnc.getPassWdOutward(password, encType)
  //  randomStr
  const mix64 = new MixBase64(passwdOutward)
  let encodeName = mix64.encode(plainName)
  const crc6Bit = crc6.checksum(Buffer.from(encodeName + passwdOutward))
  const crc6Check = MixBase64.getSourceChar(crc6Bit)
  encodeName += crc6Check
  return encodeName
}

export function encodeName(password, encType, plainName) {
  const isBad = isBadText(plainName)
  // 加密的时候就不允许加密乱码的文件名，对于之前加密过的名字可能会显示密文
  if (isBad) {
    logger.warn('@isBad plainName', plainName)
    return plainName
  }
  const nameBuf = Buffer.from(plainName, 'utf8')
  const cha20 = new FlowEnc(password, encType, nameBuf.length)
  const encNameBytes = cha20.encryptFlow.encrypt(nameBuf)
  // 转base64url或者是转cjk，加上MD5避免文件名产生可校验特征
  const crc32Val = crc32(Buffer.concat([encNameBytes, cha20.key]))
  // 3. 把crc32写入4字节Buffer【小端】
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32LE(crc32Val, 0)
  // 合并原始字节+crc16Bit，输出baes64Url或者cjk编码
  const combined = Buffer.concat([encNameBytes, crcBuf])
  // base64Util.encode4Url(combined)
  return binToCjk(combined)
}

// 字符判断
const unsafePattern = /[^a-zA-Z0-9\-_+~]/g

export function decodeOldName(password, encType, encodeName) {
  const crc6Check = encodeName.substring(encodeName.length - 1)
  const passwdOutward = FlowEnc.getPassWdOutward(password, encType)
  const mix64 = new MixBase64(passwdOutward)
  // start dec
  const subEncName = encodeName.substring(0, encodeName.length - 1)
  const crc6Bit = crc6.checksum(Buffer.from(subEncName + passwdOutward))
  // console.log(subEncName, MixBase64.getSourceChar(crc6Bit), crc6Check)
  if (MixBase64.getSourceChar(crc6Bit) !== crc6Check) {
    return null
  }
  // event pass crc6，it maybe decode error, like this name '68758PICxAd_1024-666 - 副本33.png'
  let decodeStr = null
  try {
    decodeStr = mix64.decode(subEncName).toString('utf8')
  } catch (e) {
    console.log('@@mix64 decode error', subEncName)
  }
  if (isBadText(decodeStr)) {
    logger.error('@decodeold bad name', decodeStr)
  }
  return decodeStr
}
// 兼容原来的加密
export function decodeName(password, encType, encodeName) {
  // 判断字符是否正确
  let codeType = 0
  if (!unsafePattern.test(encodeName)) {
    codeType = 1
  } else if (isCJKCode(encodeName)) {
    // 判断是否cjk的编码，则进行cjk解码
    codeType = 2
  }
  // 由于新算法采用base64url，取模一定是等于0,2,3，所以可以进行区分
  const crcMod = encodeName.length % 4
  if (crcMod === 1 && codeType === 1) {
    return decodeOldName(password, encType, encodeName)
  }
  // 判断是否cjk的编码，则进行cjk解码
  const fullBuf = codeType === 2 ? cjkToBin(encodeName) : base64Util.decode4Url(encodeName)
  // 开始解码，后4字节是CRC32校验码
  const encNameBytes = fullBuf.subarray(0, fullBuf.length - 4)
  const crc32Bytes = fullBuf.subarray(fullBuf.length - 4)
  const cha20 = new FlowEnc(password, encType, encNameBytes.length)
  // 校验crc32，添加key混淆避免有特征
  const crc32Val = crc32(Buffer.concat([encNameBytes, cha20.key]))
  // Buffer.compare(crc32Bytes, crcBuf) !== 0
  // 之前写入的小端序
  if (crc32Bytes.readUInt32LE(0) !== crc32Val) {
    // 校验失败，可能是出现名字凑巧是base64url的字符串
    logger.warn('@crc32 error', encodeName)
    return null
  }
  // 校验通过开始解密
  const decNameByte = cha20.encryptFlow.decrypt(encNameBytes)
  // 如果用户在云盘手动创建文件例如：abcd123acb.txt, 依然有一定概率碰撞通过了crc32的校验通过，但如果不是乱码也允许显示
  const decodeStr = Buffer.from(decNameByte).toString('utf8')
  if (isBadText(decodeStr)) {
    // 因为加密名字就已经不允许加密乱码，所以这里出现乱码，则有可能出现了CRC32碰撞
    logger.error('@decode bad name', decodeStr)
    return null
  }
  return decodeStr
}
// 使用& 切分
const splitFlig = '&'
export function encodeFromFolder(password, encType, folderPasswd, folderEncType) {
  const passwdInfo = folderEncType + splitFlig + folderPasswd
  return encodeName(password, encType, passwdInfo)
}

export function decodeFromFolder(password, encType, encodeName) {
  const arr = encodeName.split(splitFlig)
  if (arr.length < 2) {
    return false
  }
  const folderEncName = arr[arr.length - 1]
  const decodeStr = decodeName(password, encType, folderEncName)
  if (!decodeStr) {
    return decodeStr
  }
  const folderEncType = decodeStr.substring(0, decodeStr.indexOf(splitFlig))
  const folderPasswd = decodeStr.substring(decodeStr.indexOf(splitFlig) + 1)
  return { folderEncType, folderPasswd }
}

// 检查
export function pathFindPasswd(passwdList, url) {
  for (const passwdInfo of passwdList) {
    for (const filePath of passwdInfo.encPath) {
      const regExpRes = passwdInfo.enable ? pathToRegexp(new RegExp(filePath)).exec(url) : null
      if (regExpRes) {
        // check folder name is can decode
        // getPassInfo()
        const newPasswdInfo = Object.assign({}, passwdInfo)
        // url maybe a folder, need decode
        if (!passwdInfo.encFolder) {
          const folders = url.split('/')
          for (const folderName of folders) {
            const data = decodeFromFolder(passwdInfo.password, passwdInfo.encType, folderName)
            if (data) {
              newPasswdInfo.encType = data.folderEncType
              newPasswdInfo.password = data.folderPasswd
              return { passwdInfo: newPasswdInfo, regExpRes }
            }
          }
        }
        return { passwdInfo, regExpRes }
      }
    }
  }
  return {}
}
