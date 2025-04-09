import path from 'path'
import http from 'http'
import https from 'node:https'

import { logger } from '@/common/logger'
import { cacheFileInfo } from '@/dao/fileDao'
import { convertShowName } from '@/utils/cryptoUtil'
import type { webdav } from '@/@types/webdav'

import { XMLParser } from 'fast-xml-parser'

const httpsAgent = new https.Agent({ keepAlive: true })
const httpAgent = new http.Agent({ keepAlive: true })
const parser = new XMLParser({ removeNSPrefix: true })

const webdavPropfind = async (urlAddr: string, authorization: string): Promise<webdav.PropfindResp<webdav.FileInfo>> => {
  logger.info(`webdav获取文件信息: ${decodeURIComponent(urlAddr)}`)

  let result = ''

  return new Promise((resolve, reject) => {
    const request = (~urlAddr.indexOf('https') ? https : http).request(
      urlAddr,
      {
        method: 'PROPFIND',
        headers: {
          depth: '1',
          authorization,
        },
        agent: ~urlAddr.indexOf('https') ? httpsAgent : httpAgent,
        rejectUnauthorized: false,
      },
      async (message) => {
        logger.info('webdav接收文件信息')

        if (message.statusCode === 404) {
          reject('404')
        }

        message.on('data', (chunk) => {
          result += chunk
        })

        message.on('end', () => {
          resolve(parser.parse(result))
        })
      }
    )

    request.end()
  })
}

// get file info from webdav
export async function getWebdavFileInfo(urlAddr: string, authorization: string): Promise<WebdavFileInfo | null> {
  try {
    const respBody = await webdavPropfind(urlAddr, authorization)
    const res = respBody.multistatus.response

    const size = res.propstat.prop.getcontentlength
    const name = res.propstat.prop.displayname

    return { size, name, is_dir: size === undefined, path: res.href }
  } catch (e) {
    if (e === '404') return null
  }
}

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
