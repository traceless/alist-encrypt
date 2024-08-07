import path from 'path'
import { cacheFileInfo } from '@/dao/fileDao'
import { convertShowName } from '@/utils/cryptoUtil'
import { webdav } from '@/@types/webdav'

export const cacheWebdavFileInfo = async (fileInfo: webdav.FileInfo) => {
  let contentLength = -1
  const href = fileInfo.href
  const fileName = path.basename(href)
  if (fileInfo.propstat instanceof Array) {
    contentLength = fileInfo.propstat[0].prop.getcontentlength
  } else if (fileInfo.propstat.prop) {
    contentLength = fileInfo.propstat.prop.getcontentlength
  }

  if (contentLength !== undefined && contentLength > -1) {
    const fileDetail = { path: href, name: fileName, is_dir: false, size: contentLength }
    await cacheFileInfo(fileDetail)
    return fileDetail
  }
  // cache this folder info
  const fileDetail = { path: href, name: fileName, is_dir: true, size: 0 }
  await cacheFileInfo(fileDetail)
  return fileDetail
}

export const getFileNameForShow = async (fileInfo: webdav.FileInfo, passwdInfo: PasswdInfo) => {
  let contentLength = -1
  const href = fileInfo.href
  const fileName = path.basename(href)
  if (fileInfo.propstat instanceof Array) {
    contentLength = fileInfo.propstat[0].prop.getcontentlength
  } else if (fileInfo.propstat.prop) {
    contentLength = fileInfo.propstat.prop.getcontentlength
  }
  // logger.debug('@@fileInfo_show', JSON.stringify(fileInfo))
  // is not dir
  if (contentLength !== undefined && contentLength > -1) {
    const showName = convertShowName(passwdInfo.password, passwdInfo.encType, href)
    return { fileName, showName }
  }
  // cache this folder info
  return {}
}
