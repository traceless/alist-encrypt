import path from 'path'

import { XMLParser } from 'fast-xml-parser'
import type { Context, Middleware } from 'koa'

import FlowEnc from '@/utils/flowEnc'
import { flat } from '@/utils/common'
import { logger } from '@/common/logger'
import { getWebdavFileInfo } from '@/utils/webdavClient'
import { httpClient, httpFlowClient } from '@/utils/httpClient'
import { cacheFileInfo, deleteFileInfo, getFileInfo } from '@/dao/fileDao'
import { convertRealName, convertShowName, pathFindPasswd } from '@/utils/cryptoUtil'
import { cacheWebdavFileInfo, getFileNameForShow } from '@/router/webdav/utils'
import { webdav } from '@/@types/webdav'

const parser = new XMLParser({ removeNSPrefix: true })

const headHook = async (ctx: Context, state: ProxiedState<WebdavServer | AlistServer>, passwdInfo: PasswdInfo) => {
  const urlPath = new URL(state.urlAddr).pathname
  const realFileName = convertRealName(passwdInfo.password, passwdInfo.encType, urlPath)
  const urlAddr = path.dirname(state.urlAddr) + '/' + realFileName

  ctx.body = await httpClient({
    urlAddr,
    request: ctx.req,
    response: ctx.res,
  })
}

const propfindHook = async (ctx: Context, state: ProxiedState<WebdavServer | AlistServer>, passwdInfo: PasswdInfo) => {
  const urlPath = new URL(state.urlAddr).pathname
  const realFileName = convertRealName(passwdInfo.password, passwdInfo.encType, urlPath)
  const sourceUrl = path.dirname(urlPath) + '/' + realFileName
  logger.info(`webdav PROPFIND: ${sourceUrl}`)

  const sourceFileInfo = await getFileInfo(sourceUrl)
  let urlAddr: string

  if (sourceFileInfo && !sourceFileInfo.is_dir) {
    logger.info(`非文件夹，需要转换url: ${state.urlAddr} -> ${sourceUrl}`)
    urlAddr = path.dirname(state.urlAddr) + '/' + realFileName
  } else {
    logger.info('为文件夹，无需转换url，直接请求')
    urlAddr = state.urlAddr
  }

  let respBody = await httpClient({
    urlAddr,
    request: ctx.req,
    response: ctx.res,
  })

  const respData: webdav.PropfindResp = parser.parse(respBody)

  if (respData.multistatus) {
    const response = respData.multistatus.response
    const files = response instanceof Array ? response : [response]

    await Promise.all(
      files.map(async (fileInfo) => {
        await cacheWebdavFileInfo(fileInfo)

        const { fileName, showName } = await getFileNameForShow(fileInfo, passwdInfo)

        if (fileName) {
          const showXmlName = showName.replace(/&/g, '&amp;').replace(/</g, '&gt;')
          respBody = respBody.replace(`${fileName}</D:href>`, `${encodeURI(showXmlName)}</D:href>`)
          respBody = respBody.replace(`${decodeURI(fileName)}</D:displayname>`, `${decodeURI(showXmlName)}</D:displayname>`)
        }
      })
    )
  }

  if (ctx.res.statusCode === 404) {
    // fix rclone propfind 404 ，because rclone copy will get error 501
    ctx.res.end(respBody)
    return
  }

  // fix webdav 401 bug，群晖遇到401不能使用 ctx.res.end(respBody)，而rclone遇到404只能使用ctx.res.end(respBody),神奇的bug
  ctx.status = ctx.res.statusCode
  ctx.body = respBody
}

const getHook = async (ctx: Context, state: ProxiedState<WebdavServer | AlistServer>, passwdInfo: PasswdInfo) => {
  const urlPath = new URL(state.urlAddr).pathname
  const realFileName = convertRealName(passwdInfo.password, passwdInfo.encType, urlPath)

  const headers = ctx.request.headers
  const start = headers.range ? Number(headers.range.replace('bytes=', '').split('-')[0]) : 0
  const urlAddr = path.dirname(state.urlAddr) + '/' + realFileName

  // maybe from aliyun drive, check this req url while get file list from enc folder
  if (urlPath.endsWith('/')) {
    let respBody = await httpClient({
      urlAddr,
      request: ctx.req,
      response: ctx.res,
    })

    const aurlArr = respBody.match(/href="[^"]*"/g)
    // logger.debug('@@aurlArr', aurlArr)
    if (aurlArr && aurlArr.length) {
      for (let urlStr of aurlArr) {
        urlStr = urlStr.replace('href="', '').replace('"', '')
        const aurl = decodeURIComponent(urlStr.replace('href="', '').replace('"', ''))
        const baseUrl = decodeURIComponent(urlPath)
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

  const webdavFileInfo = await getWebdavFileInfo(urlAddr, headers.authorization)

  if (!webdavFileInfo) {
    ctx.status = 404
    return
  }

  //更新缓存
  await cacheFileInfo(webdavFileInfo)

  const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, webdavFileInfo.size)
  if (start) await flowEnc.setPosition(start)

  await httpFlowClient({
    urlAddr,
    passwdInfo,
    fileSize: state.fileSize,
    request: ctx.req,
    response: ctx.res,
    encryptTransform: undefined,
    decryptTransform: flowEnc.decryptTransform(),
  })
}

const putHook = async (ctx: Context, state: ProxiedState<WebdavServer | AlistServer>, passwdInfo: PasswdInfo) => {
  const urlPath = new URL(state.urlAddr).pathname
  const realFileName = convertRealName(passwdInfo.password, passwdInfo.encType, urlPath)
  const headers = ctx.request.headers

  const urlAddr = path.dirname(state.urlAddr) + '/' + realFileName
  logger.info(`webdav上传: ${urlAddr}`)

  const encryptTransform = state.fileSize === 0 ? undefined : new FlowEnc(passwdInfo.password, passwdInfo.encType, state.fileSize).encryptTransform()

  const body = await httpFlowClient({
    urlAddr,
    passwdInfo,
    fileSize: state.fileSize,
    request: ctx.req,
    response: ctx.res,
    encryptTransform,
    decryptTransform: undefined,
  })

  const webdavFileInfo = await getWebdavFileInfo(urlAddr, headers.authorization)

  //缓存文件信息
  await cacheFileInfo(webdavFileInfo)

  ctx.body = body
}

const deleteHook = async (ctx: Context, state: ProxiedState<WebdavServer | AlistServer>, passwdInfo: PasswdInfo) => {
  const urlPath = new URL(state.urlAddr).pathname
  const realFileName = convertRealName(passwdInfo.password, passwdInfo.encType, urlPath)

  const urlAddr = path.dirname(state.urlAddr) + '/' + realFileName
  logger.info(`webdav删除: ${urlAddr}`)

  //删除缓存
  await deleteFileInfo(new URL(urlAddr).pathname)

  ctx.body = await httpClient({
    urlAddr,
    request: ctx.req,
    response: ctx.res,
  })
}

const copyOrMoveHook = async (ctx: Context, state: ProxiedState<WebdavServer | AlistServer>, passwdInfo: PasswdInfo) => {
  const isDir = await getFileInfo(new URL(state.urlAddr).pathname)

  if (isDir) {
    ctx.req.headers.destination = flat(ctx.req.headers.destination).replace(state.selfHost, state.serverAddr)
    ctx.body = await httpClient({ urlAddr: state.urlAddr, request: ctx.req, response: ctx.res })
    return
  }

  const urlPath = new URL(state.urlAddr).pathname
  const realFileName = convertRealName(passwdInfo.password, passwdInfo.encType, urlPath)

  const urlAddr = path.dirname(state.urlAddr) + '/' + encodeURI(realFileName)
  const destination = flat(ctx.req.headers.destination)
  const destinationDir = path.dirname(destination).replace(state.selfHost, state.serverAddr)
  const destinationRealFileName = convertRealName(passwdInfo.password, passwdInfo.encType, flat(ctx.req.headers.destination))

  //将headers.destination与原文件的path转换为未加密状态
  ctx.req.headers.destination = destinationDir + '/' + destinationRealFileName

  logger.info(`webdav移动/复制文件: ${urlAddr} -> ${ctx.req.headers.destination}`)

  //删除旧缓存
  const fileInfo = await getFileInfo(new URL(urlAddr).pathname)
  await deleteFileInfo(fileInfo.path)

  //保存新缓存
  fileInfo.path = new URL(ctx.req.headers.destination).pathname
  await cacheFileInfo(fileInfo)

  ctx.body = await httpClient({ urlAddr: urlAddr, request: ctx.req, response: ctx.res })
}

export const webdavHookMiddleware: Middleware<ProxiedState<WebdavServer | AlistServer>> = async (ctx) => {
  const method = ctx.req.method.toLocaleUpperCase()
  const state = ctx.state

  logger.info('开始转换webdav请求', method, decodeURIComponent(state.urlAddr), ctx.headers.authorization)

  const { passwdInfo } = pathFindPasswd(state.serverConfig.passwdList, decodeURIComponent(state.urlAddr))

  const encrypted = passwdInfo?.encName

  if (!encrypted || !'HEAD,PROPFIND,GET,PUT,COPY,MOVE,DELETE'.includes(method)) {
    logger.info('无需转换的webdav请求')

    if (method === 'MOVE') {
      ctx.req.headers.destination = flat(ctx.req.headers.destination).replace(state.selfHost, state.serverAddr)
    }

    await httpFlowClient({
      urlAddr: state.urlAddr,
      passwdInfo,
      fileSize: state.fileSize,
      request: ctx.req,
      response: ctx.res,
    })
    return
  }

  switch (method) {
    case 'HEAD':
      await headHook(ctx, state, passwdInfo)
      return
    case 'PROPFIND':
      await propfindHook(ctx, state, passwdInfo)
      return
    case 'GET':
      await getHook(ctx, state, passwdInfo)
      return
    case 'PUT':
      await putHook(ctx, state, passwdInfo)
      return
    case 'DELETE':
      await deleteHook(ctx, state, passwdInfo)
      return
    case 'COPY':
    case 'MOVE':
      await copyOrMoveHook(ctx, state, passwdInfo)
      return
  }
}
