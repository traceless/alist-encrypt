import { pathToRegexp } from 'path-to-regexp'
import FlowEnc from './flowEnc.js'
import path from 'path'

import MixBase64 from './mixBase64.js'
import Crcn from './crc6-8.js'

const crc6 = new Crcn(6)

// 判断是否为匹配的路径
export function pathExec(encPath, url) {
  for (const filePath of encPath) {
    const result = pathToRegexp(new RegExp(filePath)).exec(url)
    if (result) {
      return result
    }
  }
  return null
}

export function encodeName(password, encType, plainName) {
  const flowEnc = new FlowEnc(password, encType, 1)
  //  randomStr
  const mix64 = new MixBase64(flowEnc.passwdOutward)
  let encodeName = mix64.encode(plainName)
  const crc6Bit = crc6.checksum(Buffer.from(encodeName + flowEnc.passwdOutward))
  const crc6Check = MixBase64.getSourceChar(crc6Bit)
  encodeName += crc6Check
  return encodeName
}

export function decodeName(password, encType, encodeName) {
  const crc6Check = encodeName.substring(encodeName.length - 1)
  const flowEnc = new FlowEnc(password, encType, 1)
  const mix64 = new MixBase64(flowEnc.passwdOutward)
  // start dec
  const subEncName = encodeName.substring(0, encodeName.length - 1)
  const crc6Bit = crc6.checksum(Buffer.from(subEncName + flowEnc.passwdOutward))
  // console.log(subEncName, MixBase64.getSourceChar(crc6Bit), crc6Check)
  if (MixBase64.getSourceChar(crc6Bit) !== crc6Check) {
    return null
  }
  const decodeStr = mix64.decode(subEncName).toString('utf8')
  return decodeStr
}

export function encodeFolderName(password, encType, folderPasswd, folderEncType) {
  const passwdInfo = folderEncType + '_' + folderPasswd
  return encodeName(password, encType, passwdInfo)
}

export function decodeFolderName(password, encType, encodeName) {
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
export function pathFindPasswd(passwdList, url) {
  for (const passwdInfo of passwdList) {
    for (const filePath of passwdInfo.encPath) {
      const result = passwdInfo.enable ? pathToRegexp(new RegExp(filePath)).exec(url) : null
      if (result) {
        // check folder name is can decode
        // getPassInfo()
        const newPasswdInfo = Object.assign({}, passwdInfo)
        const folders = path.dirname(url).split('/')
        for (const folderName of folders) {
          const data = decodeFolderName(passwdInfo.password, passwdInfo.encType, folderName)
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
  return {}
}
