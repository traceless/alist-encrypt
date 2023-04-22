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
  try {
    const XMLdata = await httpClient(request)
    const respBody = parser.parse(XMLdata)
    const res = respBody.multistatus.response
    const filePath = res.href
    const size = res.propstat.prop.getcontentlength || 0
    const name = res.propstat.prop.displayname
    const isDir = size === 0
    return { size, name, is_dir: isDir, path: filePath }
  } catch (e) {
    console.log('@@webdavFileInfo_error:', urlAddr)
  }
  return null
}
