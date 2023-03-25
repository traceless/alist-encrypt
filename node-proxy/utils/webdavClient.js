'use strict'

import { createClient } from 'webdav'

export async function getWebdavFileInfo(url, authorization, filePath) {
  console.log('@@getWebdavFileInfo', filePath)
  const userAndPw = Buffer.from(authorization.replace('Basic ', ''), 'base64').toString('utf8')
  const userPassws = userAndPw.split(':')
  const client = createClient(url, {
    username: userPassws[0],
    password: userPassws[1],
  })
  const webdavFileInfo = await client.stat(decodeURIComponent(filePath))
  return webdavFileInfo
}
