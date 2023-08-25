'use strict'

import { pathFindPasswd, convertRealName, convertShowName } from './utils/commonUtil'
import { cacheFileInfo, getFileInfo } from './dao/fileDao'
import { logger } from './common/logger'
import path from 'path'
import { httpClient } from './utils/httpClient'
import { XMLParser } from 'fast-xml-parser'
// import { escape } from 'querystring'

async function sleep(time) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, time || 3000)
  })
}

// bodyparser解析body
const parser = new XMLParser({ removeNSPrefix: true })

function getFileNameForShow(fileInfo, passwdInfo) {
  let getcontentlength = -1
  const href = fileInfo.href
  const fileName = path.basename(href)
  if (fileInfo.propstat instanceof Array) {
    getcontentlength = fileInfo.propstat[0].prop.getcontentlength
  } else if (fileInfo.propstat.prop) {
    getcontentlength = fileInfo.propstat.prop.getcontentlength
  }
  // logger.debug('@@fileInfo_show', JSON.stringify(fileInfo))
  // is not dir
  if (getcontentlength !== undefined && getcontentlength > -1) {
    const showName = convertShowName(passwdInfo.password, passwdInfo.encType, href)
    return { fileName, showName }
  }
  // cache this folder info
  return {}
}

function cacheWebdavFileInfo(fileInfo) {
  let getcontentlength = -1
  const href = fileInfo.href
  const fileName = path.basename(href)
  if (fileInfo.propstat instanceof Array) {
    getcontentlength = fileInfo.propstat[0].prop.getcontentlength
  } else if (fileInfo.propstat.prop) {
    getcontentlength = fileInfo.propstat.prop.getcontentlength
  }
  // logger.debug('@@@cacheWebdavFileInfo', href, fileName)
  // it is a file
  if (getcontentlength !== undefined && getcontentlength > -1) {
    const fileDetail = { path: href, name: fileName, is_dir: false, size: getcontentlength }
    cacheFileInfo(fileDetail)
    return fileDetail
  }
  // cache this folder info
  const fileDetail = { path: href, name: fileName, is_dir: true, size: 0 }
  cacheFileInfo(fileDetail)
  return fileDetail
}

// 拦截全部
const handle = async (ctx, next) => {
  const request = ctx.req
  const { passwdList } = request.webdavConfig
  const { passwdInfo } = pathFindPasswd(passwdList, decodeURIComponent(request.url))
  if (ctx.method.toLocaleUpperCase() === 'PROPFIND' && passwdInfo && passwdInfo.encName) {
    // check dir, convert url
    const url = request.url
    if (passwdInfo && passwdInfo.encName) {
      // check dir, convert url
      const reqFileName = path.basename(url)
      // cache source file info, realName has execute encodeUrl()，this '(' '+' can't encodeUrl.
      const realName = convertRealName(passwdInfo.password, passwdInfo.encType, url)
      // when the name contain the + , ! ,
      const sourceUrl = path.dirname(url) + '/' + realName
      const sourceFileInfo = await getFileInfo(sourceUrl)
      logger.debug('@@@sourceFileInfo', sourceFileInfo, reqFileName, realName, url, sourceUrl)
      // it is file, convert file name
      if (sourceFileInfo && !sourceFileInfo.is_dir) {
        request.url = path.dirname(request.url) + '/' + realName
        request.urlAddr = path.dirname(request.urlAddr) + '/' + realName
      }
    }
    // decrypt file name
    let respBody = await httpClient(ctx.req, ctx.res)
    const respData = parser.parse(respBody)
    // convert file name for show
    if (respData.multistatus) {
      const respJson = respData.multistatus.response
      if (respJson instanceof Array) {
        // console.log('@@respJsonArray', respJson)
        respJson.forEach((fileInfo) => {
          // cache real file info，include forder name
          cacheWebdavFileInfo(fileInfo)
          if (passwdInfo && passwdInfo.encName) {
            const { fileName, showName } = getFileNameForShow(fileInfo, passwdInfo)
            // logger.debug('@@getFileNameForShow1 list', passwdInfo.password, fileName, decodeURI(fileName), showName)
            if (fileName) {
              const showXmlName = showName.replace(/&/g, '&amp;').replace(/</g, '&gt;')
              respBody = respBody.replace(`${fileName}</D:href>`, `${encodeURI(showXmlName)}</D:href>`)
              respBody = respBody.replace(`${decodeURI(fileName)}</D:displayname>`, `${decodeURI(showXmlName)}</D:displayname>`)
            }
          }
        })
        // waiting cacheWebdavFileInfo a moment
        await sleep(50)
      } else if (passwdInfo && passwdInfo.encName) {
        const fileInfo = respJson
        const { fileName, showName } = getFileNameForShow(fileInfo, passwdInfo)
        // logger.debug('@@getFileNameForShow2 file', fileName, showName, url, respJson.propstat)
        if (fileName) {
          const showXmlName = showName.replace(/&/g, '&amp;').replace(/</g, '&gt;')
          respBody = respBody.replace(`${fileName}</D:href>`, `${encodeURI(showXmlName)}</D:href>`)
          respBody = respBody.replace(`${decodeURI(fileName)}</D:displayname>`, `${decodeURI(showXmlName)}</D:displayname>`)
        }
      }
    }
    // 检查数据兼容的问题，优先XML对比。
    // logger.debug('@@respJsxml', respBody, ctx.headers)
    // const resultBody = parser.parse(respBody)
    // logger.debug('@@respJSONData2', ctx.res.statusCode, JSON.stringify(resultBody))

    if (ctx.res.statusCode === 404) {
      // fix rclone propfind 404 ，because rclone copy will get error 501
      ctx.res.end(respBody)
      return
    }
    // fix webdav 401 bug，群晖遇到401不能使用 ctx.res.end(respBody)，而rclone遇到404只能使用ctx.res.end(respBody),神奇的bug
    ctx.status = ctx.res.statusCode
    ctx.body = respBody
    return
  }
  // copy or move file
  if ('COPY,MOVE'.includes(request.method.toLocaleUpperCase()) && passwdInfo && passwdInfo.encName) {
    const url = request.url
    const realName = convertRealName(passwdInfo.password, passwdInfo.encType, url)
    request.headers.destination = path.dirname(request.headers.destination) + '/' + encodeURI(realName)
    request.url = path.dirname(request.url) + '/' + encodeURI(realName)
    request.urlAddr = path.dirname(request.urlAddr) + '/' + encodeURI(realName)
  }

  // upload file
  if ('GET,PUT,DELETE'.includes(request.method.toLocaleUpperCase()) && passwdInfo && passwdInfo.encName) {
    const url = request.url
    // check dir, convert url
    const fileName = path.basename(url)
    const realName = convertRealName(passwdInfo.password, passwdInfo.encType, url)
    // maybe from aliyundrive, check this req url while get file list from enc folder
    if (url.endsWith('/') && request.method.toLocaleUpperCase() === 'GET') {
      let respBody = await httpClient(ctx.req, ctx.res)
      const aurlArr = respBody.match(/href="[^"]*"/g)
      // logger.debug('@@aurlArr', aurlArr)
      if (aurlArr && aurlArr.length) {
        for (let urlStr of aurlArr) {
          urlStr = urlStr.replace('href="', '').replace('"', '')
          const aurl = decodeURIComponent(urlStr.replace('href="', '').replace('"', ''))
          const baseUrl = decodeURIComponent(url)
          if (aurl.includes(baseUrl)) {
            const fileName = path.basename(aurl)
            const showName = convertShowName(passwdInfo.password, passwdInfo.encType, fileName)
            logger.debug('@@aurl', urlStr, showName)
            respBody = respBody.replace(path.basename(urlStr), encodeURI(showName)).replace(fileName, showName)
          }
        }
      }
      ctx.res.end(respBody)
      return
    }

    // console.log('@@convert file name', fileName, realName)
    request.url = path.dirname(request.url) + '/' + realName
    request.urlAddr = path.dirname(request.urlAddr) + '/' + realName
    // cache file before upload in next(), rclone cmd 'copy' will PROPFIND this file when the file upload success right now
    const contentLength = request.headers['content-length'] || request.headers['x-expected-entity-length'] || 0
    const fileDetail = { path: url, name: fileName, is_dir: false, size: contentLength }
    logger.info('@@@put url', url)
    // 在页面上传文件，rclone会重复上传，所以要进行缓存文件信息，也不能在next() 因为rclone copy命令会出异常
    await cacheFileInfo(fileDetail)
  }
  await next()
}

export default handle
