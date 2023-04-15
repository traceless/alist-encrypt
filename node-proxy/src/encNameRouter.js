'use strict'

import Router from 'koa-router'
import bodyparser from 'koa-bodyparser'
import { encodeName, decodeName, pathFindPasswd } from './utils/commonUtil.js'
import path from 'path'
import { httpClient, httpProxy } from './utils/httpClient.js'
import FlowEnc from './utils/flowEnc.js'
import { getFileInfo } from './dao/fileDao.js'

// bodyparser解析body
const bodyparserMw = bodyparser({ enableTypes: ['json', 'form', 'text'] })

const encNameRouter = new Router()
const origPrefix = 'orig_'

// 拦截全部
encNameRouter.all('/api/fs/list', async (ctx, next) => {
  console.log('@@encrypt file name ', ctx.req.url)
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
      const { passwdInfo } = pathFindPasswd(passwdList, decodeURI(fileInfo.path))
      if (passwdInfo && passwdInfo.encName) {
        const ext = path.extname(fileInfo.name)
        // Ignore suffix
        const fileName = fileInfo.name.replace(ext, '')
        const decName = decodeName(passwdInfo.password, passwdInfo.encType, fileName)
        if (decName) {
          // Ignore suffix
          fileInfo.name = decName
        } else {
          fileInfo.name = origPrefix + fileInfo.name
        }
      }
    }
  }
})

// 处理网页上传文件
encNameRouter.put('/api/fs/put', async (ctx, next) => {
  const request = ctx.req
  const { headers, webdavConfig } = request
  const contentLength = headers['content-length'] || 0
  request.fileSize = contentLength * 1

  const uploadPath = headers['file-path'] ? decodeURIComponent(headers['file-path']) : '/-'
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, uploadPath)
  if (passwdInfo) {
    const fileName = path.basename(uploadPath)
    // you can custom Suffix
    if (passwdInfo.encName) {
      const ext = passwdInfo.encSuffix || path.extname(fileName)

      const encName = encodeName(passwdInfo.password, passwdInfo.encType, fileName)
      const filePath = path.dirname(uploadPath) + '/' + encName + ext
      console.log('@@@encfileName', fileName, uploadPath, filePath)
      headers['file-path'] = encodeURIComponent(filePath)
    }
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, request.fileSize)
    return await httpProxy(ctx.req, ctx.res, flowEnc.encryptTransform())
  }
  return await httpProxy(ctx.req, ctx.res)
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
      if (name.indexOf(origPrefix) === 0) {
        const origName = name.replace(origPrefix, '')
        fileNames.push(origName)
        break
      }
      const fileName = path.basename(name)
      // you can custom Suffix
      const ext = passwdInfo.encSuffix || path.extname(fileName)
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

const copyOrMoveFile = async (ctx, next) => {
  const { dst_dir: dstDir, src_dir: srcDir, names } = ctx.request.body
  const { webdavConfig } = ctx.req
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, srcDir)
  const fileNames = []
  if (passwdInfo && passwdInfo.encName) {
    for (const name of names) {
      // is not enc name
      if (name.indexOf(origPrefix) === 0) {
        const origName = name.replace(origPrefix, '')
        fileNames.push(origName)
        break
      }
      const fileName = path.basename(name)
      // you can custom Suffix
      const ext = passwdInfo.encSuffix || path.extname(fileName)
      const encName = encodeName(passwdInfo.password, passwdInfo.encType, fileName)
      const newFileName = encName + ext
      fileNames.push(newFileName)
    }
  }
  const reqBody = { dst_dir: dstDir, src_dir: srcDir, names: fileNames }
  ctx.req.reqBody = JSON.stringify(reqBody)
  // reset content-length length
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req)
  ctx.body = respBody
}

encNameRouter.all('/api/fs/move', bodyparserMw, copyOrMoveFile)
encNameRouter.all('/api/fs/copy', bodyparserMw, copyOrMoveFile)

encNameRouter.all('/api/fs/get', bodyparserMw, async (ctx, next) => {
  const { path: filePath } = ctx.request.body
  const { webdavConfig } = ctx.req
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  if (passwdInfo && passwdInfo.encName) {
    // reset content-length length
    delete ctx.req.headers['content-length']
    // check fileName is not enc
    const fileName = path.basename(filePath)
    const fileInfo = await getFileInfo(encodeURI(filePath))
    if (fileInfo && fileInfo.is_dir) {
      await next()
      return
    }
    //  Check if it is a directory
    if (fileName.indexOf(origPrefix) === 0) {
      ctx.request.body.path = ctx.request.body.path.replace(origPrefix, '')
      await next()
      return
    }
    const ext = passwdInfo.encSuffix || path.extname(fileName)
    const encName = encodeName(passwdInfo.password, passwdInfo.encType, fileName)
    const newFileName = encName + ext
    const fpath = path.dirname(filePath) + '/' + newFileName
    console.log('@@@fpath', fpath)
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
  if (passwdInfo && passwdInfo.encName) {
    // reset content-length length
    delete ctx.req.headers['content-length']
    // check fileName is not enc,
    const origName = path.basename(filePath)
    let sourceName = ''
    if (origName.indexOf(origPrefix) === 0) {
      sourceName = origName.replace(origPrefix, '')
    }
    const fileName = path.basename(filePath)
    // you can custom Suffix
    const ext = passwdInfo.encSuffix || path.extname(fileName)
    console.log('@@@sourceName', name, sourceName)
    // use sourceName
    const encFileName = sourceName || encodeName(passwdInfo.password, passwdInfo.encType, fileName) + ext
    const fpath = path.dirname(filePath) + '/' + encFileName
    const newName = encodeName(passwdInfo.password, passwdInfo.encType, name)
    reqBody.path = fpath
    reqBody.name = newName + ext
  }
  ctx.req.reqBody = reqBody
  console.log('@@@rename', reqBody)
  const respBody = await httpClient(ctx.req)
  ctx.body = respBody
})

const handleDownload = async (ctx, next) => {
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
  if (filePath.indexOf('/p/') === 0) {
    filePath = filePath.replace('/p/', '/')
  }
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  if (passwdInfo && passwdInfo.encName) {
    // reset content-length length
    delete ctx.req.headers['content-length']
    // check fileName is not enc or it is dir
    const fileName = path.basename(filePath)
    if (fileName.indexOf(origPrefix) === 0) {
      ctx.req.url = ctx.req.url.replace(origPrefix, '')
      ctx.req.urlAddr = ctx.req.urlAddr.replace(origPrefix, '')
      await next()
      return
    }
    const ext = passwdInfo.encSuffix || path.extname(fileName)
    // handle realfile url 302 redirect
    const fname = fileName.replace(ext, '')
    const decName = decodeName(passwdInfo.password, passwdInfo.encType, fname)
    if (decName) {
      await next()
      return
    }
    // replace encname
    const encName = encodeName(passwdInfo.password, passwdInfo.encType, decodeURI(fileName)) + ext
    ctx.req.url = ctx.req.url.replace(fileName, encName)
    ctx.req.urlAddr = ctx.req.urlAddr.replace(fileName, encName)
    console.log('@@@@fileName', ctx.req.url, fileName, encName)
    await next()
    return
  }
  await next()
}

encNameRouter.get(/^\/d\/*/, bodyparserMw, handleDownload)
// encNameRouter.get(/\/p\/*/, bodyparserMw, handleDownload)

// restRouter.all(/\/enc-api\/*/, router.routes(), restRouter.allowedMethods())
export default encNameRouter
