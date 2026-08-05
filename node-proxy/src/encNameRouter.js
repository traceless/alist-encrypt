'use strict'

import Router from 'koa-router'
import bodyparser from 'koa-bodyparser'
import { encodeName, pathFindPasswd, convertShowName, convertRealName, convertRealPath } from './utils/commonUtil'
import path from 'path'
import { httpClient, httpProxy } from './utils/httpClient'
import FlowEnc from './utils/flowEnc'
import { logger } from './common/logger'
import levelDB from './utils/levelDB'
import crypto from 'crypto'
import { cacheFileInfo, getFileInfo } from './dao/fileDao'

async function sleep(time) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, time || 3000)
  })
}

// bodyparser解析body
const bodyparserMw = bodyparser({ enableTypes: ['json', 'form', 'text'] })

const encNameRouter = new Router()

// 缓存alist的文件信息
const cacheFileInfoList = async (ctx, next) => {
  const { path: foldPath } = ctx.request.body
  // 添加 '/‘
  const { passwdInfo } = pathFindPasswd(ctx.req.webdavConfig.passwdList, foldPath + '/')
  const folderInfo = await getFileInfo(foldPath)
  // 全面使用缓存来代替’加密替换‘，因为路径可能使用多种加密方式处理过。
  // const realfoldPath = convertRealPath(passwdInfo, foldPath)
  const realfoldPath = folderInfo?.is_dir ? folderInfo.path : foldPath
  ctx.request.body.path = realfoldPath

  // 判断打开的文件是否要解密，要解密则替换url，否则透传
  ctx.req.reqBody = JSON.stringify(ctx.request.body)
  logger.info('@@fs/reqBody', foldPath, realfoldPath, ctx.req.reqBody)
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req)
  // logger.info('@@@respBody', respBody)
  const result = JSON.parse(respBody)
  ctx.body = result
  if (!result.data) {
    await next()
    return
  }
  const content = result.data.content
  if (!content) {
    await next()
    return
  }
  for (let i = 0; i < content.length; i++) {
    const fileInfo = content[i]
    fileInfo.path = realfoldPath + '/' + fileInfo.name
    if (passwdInfo?.encName) {
      fileInfo.showPath = foldPath + '/' + convertShowName(passwdInfo.password, passwdInfo.encType, fileInfo.name)
    } else {
      fileInfo.showPath = foldPath + '/' + fileInfo.name
    }
    // 这里要注意闭包问题，mad
    logger.debug('@@cacheFileInfo_path', foldPath, fileInfo)
    cacheFileInfo(fileInfo)
  }
  // waiting cacheFileInfo a moment
  if (content.length > 100) {
    await sleep(50)
  }
  logger.info('@@fs/list', content.length)
  await next()
}

const decryptFileList = async (ctx, next) => {
  const result = ctx.body
  const { passwdList } = ctx.req.webdavConfig
  if (result.code === 200 && result.data) {
    const content = result.data.content
    if (!content) {
      return
    }
    for (let i = 0; i < content.length; i++) {
      const fileInfo = content[i]
      //  Check path if the file name needs to be encrypted
      const { passwdInfo } = pathFindPasswd(passwdList, fileInfo.path)
      if (!passwdInfo) {
        continue
      }
      // ingore encName
      if (fileInfo.is_dir && passwdInfo.encFolder) {
        fileInfo.name = convertShowName(passwdInfo.password, passwdInfo.encType, fileInfo.name)
      } else if (!fileInfo.is_dir && passwdInfo.encName) {
        fileInfo.name = convertShowName(passwdInfo.password, passwdInfo.encType, fileInfo.name)
      }
    }
    const coverNameMap = {} //根据不含后缀的视频文件名找到对应的含后缀的封面文件名
    const omitNames = [] //用于隐藏封面文件
    const { path } = JSON.parse(ctx.req.reqBody)
    result.data.content.forEach((fileInfo) => {
      if (fileInfo.is_dir) {
        return
      }
      if (fileInfo.type === 5) {
        coverNameMap[fileInfo.name.split('.')[0]] = fileInfo.name
      }
    })
    result.data.content.forEach((fileInfo) => {
      if (fileInfo.is_dir) {
        return
      }
      const coverName = coverNameMap[fileInfo.name.split('.')[0]]
      if (fileInfo.type === 2 && coverName) {
        omitNames.push(coverName)
        fileInfo.thumb = `/d${path}/${coverName}`
      }
    })
    //不展示封面文件，也许可以添加个配置让用户选择是否展示封面源文件
    result.data.content = result.data.content.filter((fileInfo) => !omitNames.includes(fileInfo.name))
  }
}

// 拦截/api/fs/list
encNameRouter.all('/api/fs/list', bodyparserMw, cacheFileInfoList, decryptFileList)

// 处理网页上传文件
encNameRouter.put('/api/fs/put', async (ctx, next) => {
  const request = ctx.req
  const { headers, webdavConfig } = request
  const contentLength = headers['content-length'] || 0
  request.fileSize = contentLength * 1
  const uploadShowPath = headers['file-path'] ? decodeURIComponent(headers['file-path']) : '/-'
  const fileName = path.basename(uploadShowPath)
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, uploadShowPath)
  logger.info('@@fs/put', uploadShowPath)
  let uploadPath = path.dirname(uploadShowPath)
  const folder = await getFileInfo(uploadPath)
  // uploadPath = convertRealPath(passwdInfo, uploadPath)
  uploadPath = folder?.is_dir ? folder.path : uploadPath
  uploadPath = uploadPath + '/' + fileName
  headers['file-path'] = encodeURIComponent(uploadPath)
  if (passwdInfo) {
    // you can custom Suffix
    if (passwdInfo.encName) {
      // convertRealName()会处理掉orig_的名字，所以用原始的encodeName
      const ext = passwdInfo.encSuffix || path.extname(fileName)
      const encName = encodeName(passwdInfo.password, passwdInfo.encType, fileName)
      const filePath = path.dirname(uploadPath) + '/' + encName + ext
      logger.info('@@encfileName', fileName, uploadPath, filePath)
      headers['file-path'] = encodeURIComponent(filePath)
    }
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, request.fileSize)
    return await httpProxy(ctx.req, ctx.res, flowEnc.encryptTransform())
  }
  // 上传完之后，应该把这个文件缓存起来，不然页面上无法立刻获取到，TODO
  return await httpProxy(ctx.req, ctx.res)
})

// remove删除文件
encNameRouter.all('/api/fs/remove', bodyparserMw, async (ctx, next) => {
  const { dir: folderPath, names } = ctx.request.body
  const folderInfo = await getFileInfo(folderPath)
  const dir = folderInfo?.path ?? folderPath
  const { webdavConfig } = ctx.req
  // 遇到跟目录会识别不了，必须是/aliyun/encfold/
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, dir + '/')
  // maybe a folder，remove anyway the name
  const fileNames = Object.assign([], names)
  if (passwdInfo && passwdInfo.encName) {
    for (let i = 0; i < names.length; i++) {
      const folderInfo = await getFileInfo(folderPath + '/' + names[i])
      if (folderInfo) {
        fileNames[i] = path.basename(folderInfo.path)
      }
      logger.info('@@remove name', fileNames[i])
    }
  }
  const reqBody = { dir, names: fileNames }
  logger.info('@@reqBody remove', reqBody)
  ctx.req.reqBody = JSON.stringify(reqBody)
  // reset content-length length
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req)
  ctx.body = respBody
})

// 处理目录加密，这里把目录的路径缓存起来，后续可以做映射查询
encNameRouter.all('/api/fs/dirs', bodyparserMw, async (ctx, next) => {
  const { path: foldPath } = ctx.request.body
  const { passwdInfo } = pathFindPasswd(ctx.req.webdavConfig.passwdList, foldPath + '/')
  // 尝试从缓存读取真实路径，
  const folderInfo = await getFileInfo(foldPath)
  // 如果不存在，则说明是刚进来的跟目录
  const realfoldPath = folderInfo?.is_dir ? folderInfo.path : foldPath
  ctx.request.body.path = realfoldPath

  // 判断打开的文件是否要解密，要解密则替换url，否则透传
  ctx.req.reqBody = JSON.stringify(ctx.request.body)
  logger.info('@@fs/dirs', ctx.req.reqBody)
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req)
  // logger.info('@@@respBody', respBody)
  const result = JSON.parse(respBody)
  ctx.body = result
  // /aliyun/encfold 应该返回 encName，但是正则表达识别不了，必须是/aliyun/encfold/，添加foldPath + '/'

  if (passwdInfo?.encFolder) {
    logger.info('@@fs/result.data', result.data)
    if (result.data?.length > 0) {
      for (let nameObj of result.data) {
        nameObj.origName = nameObj.name
        nameObj.name = convertShowName(passwdInfo.password, passwdInfo.encType, nameObj.name)
      }
    }
  }
  // 把文件路径缓存起来
  if (result.data?.length > 0 && foldPath !== '/') {
    for (let nameObj of result.data) {
      const fileInfo = {}
      fileInfo.name = nameObj.origName ?? nameObj.name
      fileInfo.path = foldPath + '/' + fileInfo.name
      fileInfo.showPath = realfoldPath + '/' + nameObj.name
      fileInfo.is_dir = true
      fileInfo.size = 0
      // 保持原接口一致的结构相应
      delete nameObj.origName
      cacheFileInfo(fileInfo)
    }
  }
  logger.info('@@fs/dirs', realfoldPath)
})
// 因为文件目录可以是适配多个算法，所以尽可能从缓存读取路径映射
encNameRouter.all('/api/fs/mkdir', bodyparserMw, async (ctx, next) => {
  const { path: foldPath } = ctx.request.body
  const { webdavConfig } = ctx.req

  const folder = await getFileInfo(path.dirname(foldPath))
  const subPath = folder?.path ?? path.dirname(foldPath)
  let name = path.basename(foldPath)
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, foldPath)
  if (passwdInfo?.encFolder) {
    name = convertRealName(passwdInfo.password, passwdInfo.encType, name)
  }
  const realfoldPath = subPath + '/' + name
  ctx.request.body.path = realfoldPath
  // 判断打开的文件是否要解密，要解密则替换url，否则透传
  ctx.req.reqBody = JSON.stringify(ctx.request.body)
  logger.info('@@fs/mkdirs', ctx.req.reqBody)
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req)
  // logger.info('@@@respBody', respBody)
  const result = JSON.parse(respBody)
  ctx.body = result
  logger.info('@@fs/mkdir', realfoldPath)
})

const copyOrMoveFile = async (ctx, next) => {
  const { dst_dir, src_dir, names } = ctx.request.body
  const { webdavConfig } = ctx.req
  const dstFolder = await getFileInfo(dst_dir)
  const dstDir = dstFolder?.is_dir ? dstFolder.path : dst_dir
  const srcFolder = await getFileInfo(src_dir)
  const srcDir = srcFolder?.is_dir ? srcFolder.path : src_dir

  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, srcDir + '/')
  let fileNames = []
  if (passwdInfo?.encName && names) {
    logger.info('@@move encName', passwdInfo.encName)
    for (let i = 0; i < names.length; i++) {
      fileNames[i] = convertRealName(passwdInfo.password, passwdInfo.encType, names[i])
    }
  } else {
    fileNames = Object.assign([], names)
  }
  const reqBody = { dst_dir: dstDir, src_dir: srcDir, names: fileNames }
  ctx.req.reqBody = JSON.stringify(reqBody)
  logger.info('@@move reqBody', ctx.req.reqBody)
  // reset content-length length
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req)
  ctx.body = respBody
}

encNameRouter.all('/api/fs/move', bodyparserMw, copyOrMoveFile)
encNameRouter.all('/api/fs/copy', bodyparserMw, copyOrMoveFile)
encNameRouter.all('/api/fs/recursive_move', bodyparserMw, copyOrMoveFile)

const preHandleFolderPath = async (ctx, next) => {
  // reset content-length length
  delete ctx.req.headers['content-length']
  let { path: filePath } = ctx.request.body
  const { webdavConfig } = ctx.req
  const folderInfo = await getFileInfo(filePath)
  if (folderInfo) {
    ctx.request.body.path = folderInfo.path
    return await next()
  }
  // 上面的folderInfo 一定会存在，除非缓存过期，比如分享的文件给别人.
  // 下面的代码意义不大，大概率会
  const fileRealPath = convertRealPath(ctx.req.webdavConfig.passwdList, filePath)
  // 判断是否请求目录，上面的缓存失效，说明这里大概率也是失效
  const fileInfo = await getFileInfo(fileRealPath)
  if (fileInfo?.is_dir) {
    ctx.request.body.path = fileRealPath
    return await next()
  }
  // 尝试以文件的路径进行请求，除非缓存失效，否则这里代码不会执行
  const folderRealPath = convertRealPath(ctx.req.webdavConfig.passwdList, path.dirname(filePath))
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  if (passwdInfo?.encName) {
    // check fileName is not enc
    const fileName = path.basename(filePath)
    //  Check if it is a directory
    const realName = convertRealName(passwdInfo.password, passwdInfo.encType, fileName)
    const fpath = folderRealPath + '/' + realName
    ctx.request.body.path = fpath
  }
  await next()
}

// 处理在线视频播放的问题，修改它的返回播放地址 为本代理的地址。
encNameRouter.all('/api/fs/get', bodyparserMw, preHandleFolderPath, async (ctx, next) => {
  const { path: filePath } = ctx.request.body
  // 判断打开的文件是否要解密，要解密则替换url，否则透传
  ctx.req.reqBody = JSON.stringify(ctx.request.body)
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req)
  const result = JSON.parse(respBody)
  const { headers, webdavConfig } = ctx.req
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  if (passwdInfo) {
    // 修改返回的响应，匹配到要解密，就302跳转到本服务上进行代理流量
    logger.info('@@getFile ', filePath, ctx.req.reqBody, result)
    const key = crypto.randomUUID()
    await levelDB.setExpire(key, { redirectUrl: result.data.raw_url, passwdInfo, fileSize: result.data.size }, 60 * 60 * 72) // 缓存起来，默认3天，足够下载和观看了
    // 如果是文件则处理一下跳转
    if (!result.data.is_dir) {
      const origin = headers.origin || (headers['x-forwarded-proto'] || ctx.protocol) + '://' + ctx.req.selfHost
      result.data.raw_url = `${origin}/redirect/${key}?decode=1&lastUrl=${encodeURIComponent(filePath)}`
      if (result.data.provider === 'AliyundriveOpen') result.data.provider = 'Local'
    }
    const showName = convertShowName(passwdInfo.password, passwdInfo.encType, result.data.name)
    result.data.name = showName
  }
  ctx.body = result
})

// 处理参数中是目录路径还是文件路径
const handleFolderPath = async (ctx, next) => {
  const { path: filePath, name } = ctx.request.body
  const { webdavConfig } = ctx.req
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  if (!passwdInfo) {
    await next()
    return
  }
  const fileInfoData = await getFileInfo(filePath)
  if (fileInfoData) {
    // 把名字加密一下
    let realName = name
    if (fileInfoData.is_dir && passwdInfo.encFolder) {
      realName = convertRealName(passwdInfo.password, passwdInfo.encType, name)
    }
    if (!fileInfoData.is_dir && passwdInfo.encName) {
      realName = convertRealName(passwdInfo.password, passwdInfo.encType, name)
    }
    ctx.request.body = { path: fileInfoData.path, name: realName }
    return await next()
  }
  // 不加密目录，也不加密文件名
  ctx.request.body = { path: filePath, name }
  await next()
}
encNameRouter.all('/api/fs/rename', bodyparserMw, handleFolderPath, async (ctx, next) => {
  let { path: filePath, name } = ctx.request.body
  const reqBody = { path: filePath, name }
  logger.debug('@@rename_reqBody', reqBody)
  ctx.req.reqBody = reqBody
  // reset content-length length
  delete ctx.req.headers['content-length']
  const respBody = await httpClient(ctx.req, ctx.res)
  ctx.status = ctx.res.statusCode
  ctx.body = respBody
})
// 替换字符，http://alist.com/p/show电影.txt?sign=12.. 替换 http://alist.com/p/realname.txt?sign=12..
const regexPath = /\/([^\\/]*?)(\?|$)/
const handleDownload = async (ctx, next) => {
  const request = ctx.req
  const response = ctx.res
  const { webdavConfig } = ctx.req
  // 要定位请求文件的位置 bytes=98304-
  const range = request.headers.range
  const start = range ? range.replace('bytes=', '').split('-')[0] * 1 : 0

  let filePath = ctx.req.url.split('?')[0]
  // 如果是alist的话，那么必然有这个文件的size缓存（进过list就会被缓存起来）
  request.fileSize = 0
  // 这里需要处理掉/p 路径，才能找到真实的文件信息
  if (filePath.indexOf('/d/') === 0) {
    filePath = filePath.replace('/d/', '/')
  }
  if (filePath.indexOf('/p/') === 0) {
    filePath = filePath.replace('/p/', '/')
  }
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  logger.info('@@handleDownload', filePath)
  // 全新的设计直接通过缓存找到的真实路径，不用那么折腾
  const fileInfo = await getFileInfo(decodeURIComponent(filePath))
  if (fileInfo) {
    ctx.req.url = ctx.req.url.replace(filePath, fileInfo.path)
    ctx.req.urlAddr = ctx.req.urlAddr.replace(filePath, fileInfo.path)
    request.fileSize = fileInfo.size * 1
  }
  if (passwdInfo) {
    // reset content-length length
    delete ctx.req.headers['content-length']
    // Check whether the file name refers to an encrypted file or a directory
    request.passwdInfo = passwdInfo
    logger.debug('@@download-fileName', filePath, ctx.req.url, fileInfo.name)
    // 根据文件路径来获取文件的大小
    if (request.fileSize === 0) {
      // 说明不用加密
      return await httpProxy(request, response)
    }
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, request.fileSize)
    if (start) {
      await flowEnc.setPosition(start)
    }
    return await httpProxy(request, response, null, flowEnc.decryptTransform())
  }
  await httpProxy(request, response)
}
// 直接读取txt文件会用到
encNameRouter.get(/\/p\/*/, bodyparserMw, handleDownload)
encNameRouter.get(/^\/d\/*/, bodyparserMw, handleDownload)

// restRouter.all(/\/enc-api\/*/, router.routes(), restRouter.allowedMethods())
export default encNameRouter
