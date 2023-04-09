'use strict'

import Router from 'koa-router'
import bodyparser from 'koa-bodyparser'
import { encodeName, decodeName, pathFindPasswd } from './utils/commonUtil.js'
import path from 'path'
import { httpClient } from './utils/httpClient.js'
import { getFileInfo } from './dao/fileDao.js'

// bodyparser解析body
const bodyparserMw = bodyparser({ enableTypes: ['json', 'form', 'text'] })

const encNameRouter = new Router()

// 拦截全部
encNameRouter.all('/api/fs/list', async (ctx, next) => {
  console.log(' encrypt file name ', ctx.req.url)
  await next()
  const result = ctx.body
  const { passwdList } = ctx.req.webdavConfig
  if (result.code === 200 && result.data) {
    const content = result.data.content
    if (!content) {
      return
    }
    for (let i = 0; i < content.length; i++) {
      const fileInfo = content[i]
      if (fileInfo.is_dir) {
        continue
      }
      //  Check path if the file name needs to be encrypted
      const { passwdInfo } = pathFindPasswd(passwdList, fileInfo.path)
      if (passwdInfo && passwdInfo.encName) {
        const ext = path.extname(fileInfo.name)
        // Ignore suffix
        const fileName = fileInfo.name.replace(ext, '')
        const decName = decodeName(passwdInfo.password, passwdInfo.encType, fileName)
        if (decName) {
          // Ignore suffix
          fileInfo.name = decName
        }
      }
    }
  }
})

encNameRouter.all('/api/fs/put', async (ctx, next) => {
  const request = ctx.req
  const { headers, webdavConfig } = request
  const contentLength = headers['content-length'] || 0
  request.fileSize = contentLength * 1

  const uploadPath = headers['file-path'] ? decodeURIComponent(headers['file-path']) : '/-'
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, uploadPath)
  if (passwdInfo && passwdInfo.encName) {
    const fileName = path.basename(uploadPath)
    // you can custom Suffix
    const ext = passwdInfo.encSuffix.trim() || path.extname(fileName)

    const encName = encodeName(passwdInfo.password, passwdInfo.encType, fileName)
    const filePath = path.dirname(uploadPath) + '/' + encName + ext
    console.log('@@@encfileName', fileName, encName, ext)
    headers['file-path'] = encodeURIComponent(filePath)
  }
  await next()
})

// remove
encNameRouter.all('/api/fs/remove', bodyparserMw, async (ctx, next) => {
  const { dir, names } = ctx.request.body
  const { webdavConfig } = ctx.req
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, dir)
  const fileNames = []
  if (passwdInfo && passwdInfo.encName) {
    for (const name of names) {
      // is not enc name
      const fileInfo = await getFileInfo(encodeURI(dir + '/' + name))
      if (fileInfo) {
        fileNames.push(name)
        break
      }
      const fileName = path.basename(name)
      // you can custom Suffix
      const ext = passwdInfo.encSuffix.trim() || path.extname(fileName)
      const encName = encodeName(passwdInfo.password, passwdInfo.encType, fileName)
      const newFileName = encName + ext
      fileNames.push(newFileName)
    }
  }
  const reqBody = { dir, names: fileNames }
  ctx.req.reqBody = JSON.stringify(reqBody)
  // reset content-length length
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req)
  ctx.body = respBody
})

encNameRouter.all('/api/fs/get', bodyparserMw, async (ctx, next) => {
  const { path: filePath } = ctx.request.body
  const { webdavConfig } = ctx.req
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  if (passwdInfo) {
    // check fileName is not enc or it is dir
    const fileInfo = await getFileInfo(encodeURI(filePath))
    const fileName = path.basename(filePath)
    // you can custom Suffix
    const fileExt = path.extname(fileName)
    if (fileInfo || !fileExt) {
      await next()
      return
    }
    const ext = passwdInfo.encSuffix.trim() || path.extname(fileName)
    const encName = encodeName(passwdInfo.password, passwdInfo.encType, fileName)
    const newFileName = encName + ext
    const fpath = path.dirname(filePath) + '/' + newFileName
    console.log('@@@fpath', fpath)
    // reset content-length length
    delete ctx.req.headers['content-length']
    ctx.request.body.path = fpath
  }
  await next()
})

encNameRouter.all('/api/fs/rename', bodyparserMw, async (ctx, next) => {
  const { path: filePath, name } = ctx.request.body
  const { webdavConfig } = ctx.req
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  const reqBody = { path: filePath, name }
  ctx.req.reqBody = reqBody
  // reset content-length length
  delete ctx.req.headers['content-length']
  if (passwdInfo) {
    // check fileName is not enc,
    const fileInfo = await getFileInfo(encodeURI(filePath))
    let sourceName = ''
    if (fileInfo) {
      sourceName = path.basename(filePath)
    }
    const fileName = path.basename(filePath)
    // you can custom Suffix
    const ext = passwdInfo.encSuffix.trim() || path.extname(fileName)
    // use sourceName
    const encFileName = sourceName || encodeName(passwdInfo.password, passwdInfo.encType, fileName) + ext
    const fpath = path.dirname(filePath) + '/' + encFileName
    // reset content-length length
    delete ctx.req.headers['content-length']
    const newName = encodeName(passwdInfo.password, passwdInfo.encType, name)
    reqBody.path = fpath
    reqBody.name = newName + ext
  }
  ctx.req.reqBody = reqBody
  console.log('@@@rename', reqBody)

  const respBody = await httpClient(ctx.req)
  ctx.body = respBody
})

encNameRouter.all(/\/d\/*/, bodyparserMw, async (ctx, next) => {
  const request = ctx.req
  const { webdavConfig } = ctx.req

  const urlPath = ctx.req.url.split('?')[0]
  let filePath = urlPath
  // 如果是alist的话，那么必然有这个文件的size缓存（进过list就会被缓存起来）
  request.fileSize = 0
  // 这里需要处理掉/p 路径
  if (filePath.indexOf('/d/') === 0) {
    filePath = filePath.replace('/d/', '/')
  }
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  if (passwdInfo) {
    // check fileName is not enc or it is dir
    const fileInfo = await getFileInfo(filePath)
    const fileName = path.basename(filePath)
    console.log('@@@@fileName', urlPath, fileName, filePath)
    // you can custom Suffix
    if (fileInfo) {
      await next()
      return
    }
    const ext = passwdInfo.encSuffix.trim() || path.extname(fileName)
    // reset content-length length
    delete ctx.req.headers['content-length']
    // replace encname
    const encName = encodeName(passwdInfo.password, passwdInfo.encType, decodeURI(fileName))
    ctx.req.url = ctx.req.url.replace(fileName, encName + ext)
    ctx.redirect(ctx.req.url)
    ctx.status = 301
    console.log('@@@@fileName', ctx.req.url, fileName, encName)
    return
  }
  await next()
})

encNameRouter.all(/\/p\/*/, bodyparserMw, async (ctx, next) => {
  const request = ctx.req
  const { webdavConfig } = ctx.req

  const urlPath = ctx.req.url.split('?')[0]
  let filePath = urlPath
  // 如果是alist的话，那么必然有这个文件的size缓存（进过list就会被缓存起来）
  request.fileSize = 0
  // 这里需要处理掉/p 路径
  if (filePath.indexOf('/p/') === 0) {
    filePath = filePath.replace('/p/', '/')
  }
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  if (passwdInfo) {
    // check fileName is not enc or it is dir
    const fileInfo = await getFileInfo(filePath)
    const fileName = path.basename(filePath)
    console.log('@@@@ppfileName', urlPath, fileName, filePath)
    // you can custom Suffix
    if (fileInfo) {
      await next()
      return
    }
    const ext = passwdInfo.encSuffix.trim() || path.extname(fileName)
    // reset content-length length
    delete ctx.req.headers['content-length']
    // replace encname
    const encName = encodeName(passwdInfo.password, passwdInfo.encType, decodeURI(fileName))
    ctx.req.url = ctx.req.url.replace(fileName, encName + ext)
    ctx.redirect(ctx.req.url)
    ctx.status = 301
    console.log('@@@@ppfileName', ctx.req.url, fileName, encName)
    return
  }
  await next()
})

// restRouter.all(/\/enc-api\/*/, router.routes(), restRouter.allowedMethods())
export default encNameRouter
