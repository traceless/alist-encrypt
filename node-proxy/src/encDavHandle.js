'use strict'

import Router from 'koa-router'
import bodyparser from 'koa-bodyparser'
import { encodeName, decodeName, pathFindPasswd, convertRealName, convertShowName } from './utils/commonUtil.js'
import path from 'path'
import { httpClient } from './utils/httpClient.js'
import { XMLParser } from 'fast-xml-parser'
import { escape } from 'querystring'

// bodyparser解析body
const parser = new XMLParser({ removeNSPrefix: true })
const origPrefix = 'orig_'

function getFileNameForShow(fileInfo, passwdInfo) {
  let getcontentlength = -1
  if (fileInfo.propstat instanceof Array) {
    getcontentlength = fileInfo.propstat[0].prop.getcontentlength
  } else if (fileInfo.propstat.prop) {
    getcontentlength = fileInfo.propstat.prop.getcontentlength
  }
  // is not dir
  if (getcontentlength !== undefined && getcontentlength > -1) {
    const href = fileInfo.href
    const fileName = path.basename(href)
    const showName = convertShowName(passwdInfo.password, passwdInfo.encType, href)
    console.log('@@decName222', showName, fileName, decodeURI(fileName))
    // respBody = respBody.replace(new RegExp(fileName, 'g'), encodeURI(decName) )
    return { fileName, showName }
  }
  return {}
}

// 拦截全部
const handle = async (ctx, next) => {
  const request = ctx.req
  const { passwdList } = request.webdavConfig
  const { passwdInfo } = pathFindPasswd(passwdList, decodeURIComponent(request.url))
  if (ctx.method.toLocaleUpperCase() === 'PROPFIND' && passwdInfo && passwdInfo.encName) {
    // check dir, convert url
    const url = request.url
    const reqFileName = path.basename(url)
    const ext = path.extname(reqFileName)
    if (ext) {
      const realName = convertRealName(passwdInfo.password, passwdInfo.encType, url)
      request.url = url.replace(reqFileName, realName)
      request.urlAddr = request.urlAddr.replace(reqFileName, realName)
      console.log('@@fileInfohre2222', reqFileName, request.url, realName)
    }
    // decrypt file name
    let respBody = await httpClient(ctx.req, ctx.res)
    const respData = parser.parse(respBody)
    if (respData.multistatus && passwdInfo && passwdInfo.encName) {
      const respJson = respData.multistatus.response
      if (respJson instanceof Array) {
        // console.log('@@respJsonArray', respJson)
        respJson.forEach((fileInfo) => {
          const { fileName, showName } = getFileNameForShow(fileInfo, passwdInfo)
          console.log('@@respJsonfileInfo', fileName, showName)
          if (fileName) {
            respBody = respBody.replace(`${fileName}</D:href>`, `${encodeURI(showName)}</D:href>`)
            respBody = respBody.replace(`<D:displayname>${decodeURI(fileName)}`, `<D:displayname>${decodeURI(showName)}`)
          }
        })
      } else {
        const fileInfo = respJson
        const { fileName, showName } = getFileNameForShow(fileInfo, passwdInfo)
        console.log('@@respJsonOjeb', fileName, showName, url, respJson.propstat)
        if (fileName) {
          respBody = respBody.replace(`${fileName}</D:href>`, `${encodeURI(showName)}</D:href>`)
          respBody = respBody.replace(`<D:displayname>${decodeURI(fileName)}`, `<D:displayname>${decodeURI(showName)}`)
        }
      }
    }
    const respData2 = parser.parse(respBody)
    console.log('@@respJson2', JSON.stringify(respData2))
    console.log('@@respJsxml', respBody)
    ctx.body = respBody
    return
  }
  if (request.method.toLocaleUpperCase() === 'PUT' && passwdInfo) {
    // 兼容macos的webdav客户端x-expected-entity-length
    // console.log(request.)
  }
  await next()
}

export default handle
