import http from 'http'

import { XMLParser } from 'fast-xml-parser'

import { httpClient } from '@/utils/httpClient'
import { logger } from '@/common/logger'

// get file info from webdav
export async function getWebdavFileInfo(urlAddr: string, authorization: string): Promise<WebdavFileInfo | null> {
  //eslint-disable-next-line
  //@ts-ignore
  const request: http.IncomingMessage = {
    method: 'PROPFIND',
    headers: {
      depth: '1',
      authorization,
    },
  }

  const parser = new XMLParser({ removeNSPrefix: true })

  try {
    const XMLData = await httpClient({
      urlAddr,
      request,
    })
    const respBody = parser.parse(XMLData)
    const res = respBody.multistatus.response

    const size = Number(res.propstat.prop.getcontentlength || 0)
    const name = res.propstat.prop.displayname

    return { size, name, is_dir: size === 0, path: res.href }
  } catch (e) {
    logger.error('@@webdavFileInfo_error:', urlAddr)
  }
  return null
}
