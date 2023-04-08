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

export function encodeName(password, encType, folderPasswd, folderEncType) {
  const flowEnc = new FlowEnc(password, encType, 1)
  //  randomStr
  const salt = MixBase64.randomStr(1)
  const mix64 = new MixBase64(flowEnc.passwdOutward, salt)
  const passwdInfo = folderEncType + '_' + folderPasswd
  let folderNameEnc = mix64.encode(passwdInfo)
  const crc6Bit = crc6.checksum(Buffer.from(folderNameEnc))
  const crc6Check = MixBase64.getSourceChar(crc6Bit)
  folderNameEnc += crc6Check + salt
  return folderNameEnc
}

export function decodeName(password, encType, folderNameEnc) {
  const arr = folderNameEnc.split('_')
  if (arr.length < 2) {
    return false
  }
  const salt = folderNameEnc.substring(folderNameEnc.length - 1)
  const crc6Check = folderNameEnc.substring(folderNameEnc.length - 2, folderNameEnc.length - 1)
  const flowEnc = new FlowEnc(password, encType, 1)
  const mix64 = new MixBase64(flowEnc.passwdOutward, salt)
  // start dec
  let folderName = arr[arr.length - 1]
  folderName = folderName.substring(0, folderName.length - 2)
  const crc6Bit = crc6.checksum(Buffer.from(folderName))
  if (MixBase64.getSourceChar(crc6Bit) !== crc6Check) {
    return false
  }
  const passwdInfo = mix64.decode(folderName).toString('utf8')
  const folderEncType = passwdInfo.substring(0, passwdInfo.indexOf('_'))
  const folderPasswd = passwdInfo.substring(passwdInfo.indexOf('_') + 1)
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
          const data = decodeName(passwdInfo.password, passwdInfo.encType, folderName)
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
