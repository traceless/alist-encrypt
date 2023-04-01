'use strict'

import { httpClient } from './httpClient.js'
import { XMLParser } from 'fast-xml-parser'

// get file info from webdav
export async function getWebdavFileInfo(urlAddr, authorization) {
  const request = {
    method: 'PROPFIND',
    headers: {
      depth: 1,
      authorization,
    },
    urlAddr,
  }
  const parser = new XMLParser({ removeNSPrefix: true })
  const XMLdata = await httpClient(request)
  const respBody = parser.parse(XMLdata)
  const res = respBody.multistatus.response
  console.log(res)
  const filePath = res.href
  const size = res.propstat.prop.getcontentlength || 0
  const name = res.propstat.prop.displayname
  const isDir = size === 0
  return { size, name, isDir, filePath }
}
