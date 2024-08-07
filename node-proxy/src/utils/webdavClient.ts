import { XMLParser } from 'fast-xml-parser'

import https from 'node:https'
import http from 'http'
import { webdav } from '@/@types/webdav'
import { logger } from '@/common/logger'

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
