import { pathToRegexp } from 'path-to-regexp'
import FlowEnc from './flowEnc'
import path from 'path'

import MixBase64 from './mixBase64'
import Crcn from './crc6-8'
import { logger } from '@/common/logger'

const crc6 = new Crcn(6)
const origPrefix = 'orig_'
function isBadText(str) {
  // return /[ÃÂ�]/.test(str)
  return /[ÃÂ�¤§½]/.test(str)
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
export function encodeName(password, encType, plainName) {
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
// 字符判断
const unsafePattern = /[^a-zA-Z0-9\-_+~]/g
export function decodeName(password, encType, encodeName) {
  // 判断是否长度是否余
  const crcType = (encodeName.length * 6) % 8
  if (crcType !== 6 && crcType !== 12) {
    logger.debug('@@orig_decode fail', encodeName)
  }
  if (unsafePattern.test(encodeName)) {
    return null
  }
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
  return decodeStr
}

export function encodeFromFolder(password, encType, folderPasswd, folderEncType) {
  const passwdInfo = folderEncType + '_' + folderPasswd
  return encodeName(password, encType, passwdInfo)
}

export function decodeFromFolder(password, encType, encodeName) {
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

