import path from 'path'

import { pathToRegexp } from 'path-to-regexp'

import Crcn from './crypto/crc6-8'
import MixBase64 from './crypto/mixBase64'
import { logger } from '@/common/logger'
import { getPassWdOutward } from './flowEnc'

const crc6 = new Crcn(6)
const origPrefix = 'orig_'

// check file name, return real name
export function convertRealName(password: string, encType: EncryptType, pathText: string) {
  const fileName = path.basename(pathText)
  if (fileName.indexOf(origPrefix) === 0) {
    return fileName.replace(origPrefix, '')
  }
  // try encode name, fileName don't need decodeURI，encodeUrl func can't encode that like '(' '!'  in nodejs
  const ext = path.extname(fileName)
  logger.info(`获取原文件名: ${decodeURIComponent(fileName)} ${encType} ${password}`)
  const encName = encodeName(password, encType, decodeURIComponent(fileName))
  return encName + ext
}

// if file name has encrypted, return show name
export function convertShowName(password: string, encType: EncryptType, pathText: string) {
  const fileName = path.basename(decodeURIComponent(pathText))
  const ext = path.extname(fileName)
  const encName = fileName.replace(ext, '')
  // encName don't need decodeURI
  let showName = decodeName(password, encType, encName)
  if (showName === null) {
    showName = origPrefix + fileName
  }
  return showName
}

// 判断是否为匹配的路径
export function pathExec(encPath: string[], url: string) {
  for (const filePath of encPath) {
    const result = pathToRegexp(new RegExp(filePath)).exec(url)
    if (result) {
      return result
    }
  }
  return null
}

export function encodeName(password: string, encType: EncryptType, plainName: string) {
  const passwdOutward = getPassWdOutward(password, encType)
  //  randomStr
  const mix64 = new MixBase64(passwdOutward)
  let encodeName = mix64.encrypt(Buffer.from(plainName)).toString()
  const crc6Bit = crc6.checksum(Buffer.from(encodeName + passwdOutward))
  const crc6Check = MixBase64.getSourceChar(crc6Bit)
  encodeName += crc6Check
  return encodeName
}

export function decodeName(password: string, encType: EncryptType, encodeName: string) {
  const crc6Check = encodeName.substring(encodeName.length - 1)
  const passwdOutward = getPassWdOutward(password, encType)
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
    decodeStr = mix64.decrypt(Buffer.from(subEncName)).toString()
  } catch (e) {
    logger.error('@@mix64 decode error', subEncName)
  }
  return decodeStr
}

export function encodeFolderName(password: string, encType: EncryptType, folderPasswd: string, folderEncType: string) {
  const passwdInfo = folderEncType + '_' + folderPasswd
  return encodeName(password, encType, passwdInfo)
}

export function decodeFolderName(password: string, encType: EncryptType, encodeName: string) {
  const arr = encodeName.split('_')
  if (arr.length < 2) {
    return false
  }
  const folderEncName = arr[arr.length - 1]
  const decodeStr = decodeName(password, encType, folderEncName)
  if (!decodeStr) {
    return decodeStr
  }
  const folderEncType = decodeStr.substring(0, decodeStr.indexOf('_'))
  const folderPasswd = decodeStr.substring(decodeStr.indexOf('_') + 1)
  return { folderEncType, folderPasswd }
}

// 检查
export function pathFindPasswd(
  passwdList: PasswdInfo[],
  url: string
): {
  passwdInfo: PasswdInfo | null
  pathInfo: RegExpExecArray | null
} {
  for (const passwdInfo of passwdList) {
    for (const filePath of passwdInfo.encPath) {
      const result = passwdInfo.enable ? pathToRegexp(new RegExp(filePath)).exec(url) : null
      if (result) {
        // check folder name is can decode
        // getPassInfo()
        const newPasswdInfo = Object.assign({}, passwdInfo)
        // url maybe a folder, need decode
        const folders = url.split('/')
        for (const folderName of folders) {
          const data = decodeFolderName(passwdInfo.password, passwdInfo.encType, decodeURIComponent(folderName))
          if (data) {
            newPasswdInfo.encType = data.folderEncType
            newPasswdInfo.password = data.folderPasswd
            return { passwdInfo: newPasswdInfo, pathInfo: result }
          }
        }
        return { passwdInfo, pathInfo: result }
      }
    }
  }
  return { passwdInfo: null, pathInfo: null }
}
