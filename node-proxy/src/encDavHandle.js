'use strict'

import Router from 'koa-router'
import bodyparser from 'koa-bodyparser'
import { encodeName, decodeName, pathFindPasswd } from './utils/commonUtil.js'
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
    // console.log('@@fileInfohref', fileName, fileInfo.href, fileInfo.propstat, fileInfo.propstat.prop)
    const ext = path.extname(href)
    const encName = fileName.replace(ext, '')
    // decrypt filename
    let showName = decodeName(passwdInfo.password, passwdInfo.encType, decodeURI(encName))
    if (showName == null) {
      showName = origPrefix + fileName
    }
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
  if (ctx.method.toLocaleUpperCase() === 'PROPFIND' && passwdInfo) {
    // decrypt file name
    let respBody = await httpClient(ctx.req, ctx.res)
    const respData = parser.parse(respBody)
    if (respData.multistatus) {
      const respJson = respData.multistatus.response
      if (respJson instanceof Array) {
        console.log('@@respJsonArray', respJson)
        respJson.forEach((fileInfo) => {
          console.log('@@respJsonfileInfo', fileInfo.propstat)
          const { fileName, showName } = getFileNameForShow(fileInfo, passwdInfo)
          if (fileName) {
            // respBody = respBody.replace(new RegExp(fileName, 'g'), encodeURI(showName))
            respBody = respBody.replace(new RegExp(`<D:displayname>${decodeURI(fileName)}<`, 'g'), `<D:displayname>${decodeURI(showName)}<`)
          }
        })
      } else {
        console.log('@@respJsonOjeb', respJson.propstat)
        const { fileName, showName } = getFileNameForShow(respJson, passwdInfo)
        if (fileName) {
          // respBody = respBody.replace(new RegExp(fileName, 'g'), encodeURI(showName))
          respBody = respBody.replace(new RegExp(`<D:displayname>${decodeURI(fileName)}<`, 'g'), `<D:displayname>${decodeURI(showName)}<`)
        }
      }
    }
    const respData2 = parser.parse(respBody)
    console.log('@@respBody3', JSON.stringify(respData2))
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
