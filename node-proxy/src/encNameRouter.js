'use strict'

import { Hono } from 'hono'
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response'
import { encodeName, pathFindPasswd, convertShowName, convertRealName, convertRealPath } from './utils/commonUtil.js'
import path from 'path'
import { httpClient, httpProxy } from './utils/httpClient.js'
import FlowEnc from './utils/flowEnc.js'
import { logger } from './common/logger.js'
import levelDB from './utils/levelDB.js'
import crypto from 'crypto'
import { cacheFileInfo, getFileInfo } from './dao/fileDao.js'
import bodyParser from './middleware/bodyParser.js'

const encName = new Hono()

// 缓存alist的文件信息
const cacheFileInfoList = async (c, next) => {
  const body = c.get('requestBody')
  const { path: foldPath } = body
  // 添加 '/‘
  const { passwdInfo } = pathFindPasswd(c.env.incoming.webdavConfig.passwdList, foldPath + '/')
  const folderInfo = await getFileInfo(foldPath)
  // 全面使用缓存来代替’加密替换‘，因为路径可能使用多种加密方式处理过。
  // const realfoldPath = convertRealPath(passwdInfo, foldPath)
  const realfoldPath = folderInfo?.is_dir ? folderInfo.path : foldPath
  body.path = realfoldPath

  // 判断打开的文件是否要解密，要解密则替换url，否则透传
  c.env.incoming.reqBody = JSON.stringify(body)
  logger.info('@@fs/reqBody', foldPath, realfoldPath, c.env.incoming.reqBody)
  delete c.env.incoming.headers['content-length']
  const respBody = await httpClient(c.env.incoming)
  // logger.info('@@@respBody', respBody)
  const result = JSON.parse(respBody)
  // 传递给 decryptFileList 修改后统一响应，等价 koa 的 ctx.body 共享引用
  c.set('fsResult', result)
  if (!result.data) {
    await next()
    return c.json(result)
  }
  const content = result.data.content
  if (!content) {
    await next()
    return c.json(result)
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
    // 如果文件列表很多，可能会慢，后续可以调整优化为异步缓存
    await cacheFileInfo(fileInfo)
  }
  logger.info('@@fs/list', content.length)
  await next()
  return c.json(result)
}

const decryptFileList = async (c) => {
  const result = c.get('fsResult')
  const { passwdList } = c.env.incoming.webdavConfig
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
    const { path } = JSON.parse(c.env.incoming.reqBody)
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
encName.all('/api/fs/list', bodyParser, cacheFileInfoList, decryptFileList)

// 处理网页上传文件
encName.put('/api/fs/put', async (c) => {
  const request = c.env.incoming
  const response = c.env.outgoing
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
    await httpProxy(request, response, flowEnc.encryptTransform())
    return RESPONSE_ALREADY_SENT
  }
  // 上传完之后，应该把这个文件缓存起来，不然页面上无法立刻获取到，TODO
  await httpProxy(request, response)
  return RESPONSE_ALREADY_SENT
})

// remove删除文件
encName.all('/api/fs/remove', bodyParser, async (c) => {
  const { dir: folderPath, names } = c.get('requestBody')
  const folderInfo = await getFileInfo(folderPath)
  const dir = folderInfo?.path ?? folderPath
  const { webdavConfig } = c.env.incoming
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
  c.env.incoming.reqBody = JSON.stringify(reqBody)
  // reset content-length length
  delete c.env.incoming.headers['content-length']
  const respBody = await httpClient(c.env.incoming)
  return c.body(respBody)
})

// 处理目录加密，这里把目录的路径缓存起来，后续可以做映射查询
encName.all('/api/fs/dirs', bodyParser, async (c) => {
  const body = c.get('requestBody')
  const { path: foldPath } = body
  const { passwdInfo } = pathFindPasswd(c.env.incoming.webdavConfig.passwdList, foldPath + '/')
  // 尝试从缓存读取真实路径，
  const folderInfo = await getFileInfo(foldPath)
  // 如果不存在，则说明是刚进来的跟目录
  const realfoldPath = folderInfo?.is_dir ? folderInfo.path : foldPath
  body.path = realfoldPath

  // 判断打开的文件是否要解密，要解密则替换url，否则透传
  c.env.incoming.reqBody = JSON.stringify(body)
  logger.info('@@fs/dirs', c.env.incoming.reqBody)
  delete c.env.incoming.headers['content-length']
  const respBody = await httpClient(c.env.incoming)
  // logger.info('@@@respBody', respBody)
  const result = JSON.parse(respBody)
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
      await cacheFileInfo(fileInfo)
    }
  }
  logger.info('@@fs/dirs', realfoldPath)
  return c.json(result)
})
// 因为文件目录可以是适配多个算法，所以尽可能从缓存读取路径映射
encName.all('/api/fs/mkdir', bodyParser, async (c) => {
  const body = c.get('requestBody')
  const { path: foldPath } = body
  const { webdavConfig } = c.env.incoming

  const folder = await getFileInfo(path.dirname(foldPath))
  const subPath = folder?.path ?? path.dirname(foldPath)
  let name = path.basename(foldPath)
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, foldPath)
  if (passwdInfo?.encFolder) {
    name = convertRealName(passwdInfo.password, passwdInfo.encType, name)
  }
  const realfoldPath = subPath + '/' + name
  body.path = realfoldPath
  // 判断打开的文件是否要解密，要解密则替换url，否则透传
  c.env.incoming.reqBody = JSON.stringify(body)
  logger.info('@@fs/mkdirs', c.env.incoming.reqBody)
  delete c.env.incoming.headers['content-length']
  const respBody = await httpClient(c.env.incoming)
  // logger.info('@@@respBody', respBody)
  const result = JSON.parse(respBody)
  logger.info('@@fs/mkdir', realfoldPath)
  return c.json(result)
})

const copyOrMoveFile = async (c) => {
  const body = c.get('requestBody')
  const { dst_dir, src_dir, names } = body
  const { webdavConfig } = c.env.incoming
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
  c.env.incoming.reqBody = JSON.stringify(reqBody)
  logger.info('@@move reqBody', c.env.incoming.reqBody)
  // reset content-length length
  delete c.env.incoming.headers['content-length']
  const respBody = await httpClient(c.env.incoming)
  return c.body(respBody)
}

encName.all('/api/fs/move', bodyParser, copyOrMoveFile)
encName.all('/api/fs/copy', bodyParser, copyOrMoveFile)
encName.all('/api/fs/recursive_move', bodyParser, copyOrMoveFile)

const preHandleFolderPath = async (c, next) => {
  // reset content-length length
  delete c.env.incoming.headers['content-length']
  const body = c.get('requestBody')
  let { path: filePath } = body
  const { webdavConfig } = c.env.incoming
  const folderInfo = await getFileInfo(filePath)
  if (folderInfo) {
    body.path = folderInfo.path
    return await next()
  }
  // 上面的folderInfo 一定会存在，除非缓存过期，比如分享的文件给别人.
  // 下面的代码意义不大，大概率会
  const fileRealPath = convertRealPath(c.env.incoming.webdavConfig.passwdList, filePath)
  // 判断是否请求目录，上面的缓存失效，说明这里大概率也是失效
  const fileInfo = await getFileInfo(fileRealPath)
  if (fileInfo?.is_dir) {
    body.path = fileRealPath
    return await next()
  }
  // 尝试以文件的路径进行请求，除非缓存失效，否则这里代码不会执行
  const folderRealPath = convertRealPath(c.env.incoming.webdavConfig.passwdList, path.dirname(filePath))
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  if (passwdInfo?.encName) {
    // check fileName is not enc
    const fileName = path.basename(filePath)
    //  Check if it is a directory
    const realName = convertRealName(passwdInfo.password, passwdInfo.encType, fileName)
    const fpath = folderRealPath + '/' + realName
    body.path = fpath
  }
  await next()
}

// 处理在线视频播放的问题，修改它的返回播放地址 为本代理的地址。
encName.all('/api/fs/get', bodyParser, preHandleFolderPath, async (c) => {
  const body = c.get('requestBody')
  const { path: filePath } = body
  // 判断打开的文件是否要解密，要解密则替换url，否则透传
  c.env.incoming.reqBody = JSON.stringify(body)
  delete c.env.incoming.headers['content-length']
  const respBody = await httpClient(c.env.incoming)
  const result = JSON.parse(respBody)
  const { headers, webdavConfig } = c.env.incoming
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, filePath)
  if (passwdInfo) {
    // 修改返回的响应，匹配到要解密，就302跳转到本服务上进行代理流量
    logger.info('@@getFile ', filePath, c.env.incoming.reqBody, result)
    const key = crypto.randomUUID()
    await levelDB.setExpire(key, { redirectUrl: result.data.raw_url, passwdInfo, fileSize: result.data.size }, 60 * 60 * 72) // 缓存起来，默认3天，足够下载和观看了
    // 如果是文件则处理一下跳转
    if (!result.data.is_dir) {
      // 等价 koa 的 ctx.protocol
      const requestProtocol = c.env.incoming.socket.encrypted ? 'https' : 'http'
      const origin = headers.origin || (headers['x-forwarded-proto'] || requestProtocol) + '://' + c.env.incoming.selfHost
      result.data.raw_url = `${origin}/redirect/${key}?decode=1&lastUrl=${encodeURIComponent(filePath)}`
      if (result.data.provider === 'AliyundriveOpen') result.data.provider = 'Local'
    }
    const showName = convertShowName(passwdInfo.password, passwdInfo.encType, result.data.name)
    result.data.name = showName
  }
  return c.json(result)
})

// 处理参数中是目录路径还是文件路径
const handleFolderPath = async (c, next) => {
  const body = c.get('requestBody')
  const { path: filePath, name } = body
  const { webdavConfig } = c.env.incoming
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
    c.set('requestBody', { path: fileInfoData.path, name: realName })
    return await next()
  }
  // 不加密目录，也不加密文件名
  c.set('requestBody', { path: filePath, name })
  await next()
}
encName.all('/api/fs/rename', bodyParser, handleFolderPath, async (c) => {
  const { path: filePath, name } = c.get('requestBody')
  const reqBody = { path: filePath, name }
  logger.debug('@@rename_reqBody', reqBody)
  c.env.incoming.reqBody = reqBody
  // reset content-length length
  delete c.env.incoming.headers['content-length']
  const respBody = await httpClient(c.env.incoming, c.env.outgoing)
  // 等价 koa: ctx.status = ctx.res.statusCode; ctx.body = respBody
  c.env.outgoing.setHeader('content-length', Buffer.byteLength(respBody))
  c.env.outgoing.end(respBody)
  return RESPONSE_ALREADY_SENT
})
// 替换字符，http://alist.com/p/show电影.txt?sign=12.. 替换 http://alist.com/p/realname.txt?sign=12..
const handleDownload = async (c) => {
  const request = c.env.incoming
  const response = c.env.outgoing
  const { webdavConfig } = request
  // 要定位请求文件的位置 bytes=98304-
  const range = request.headers.range
  const start = range ? range.replace('bytes=', '').split('-')[0] * 1 : 0

  let filePath = request.url.split('?')[0]
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
    request.url = request.url.replace(filePath, fileInfo.path)
    request.urlAddr = request.urlAddr.replace(filePath, fileInfo.path)
    request.fileSize = fileInfo.size * 1
  }
  if (passwdInfo) {
    // reset content-length length
    delete request.headers['content-length']
    // Check whether the file name refers to an encrypted file or a directory
    request.passwdInfo = passwdInfo
    logger.debug('@@download-fileName', filePath, request.url, fileInfo.name)
    // 根据文件路径来获取文件的大小
    if (request.fileSize === 0) {
      // 说明不用加密
      await httpProxy(request, response)
      return RESPONSE_ALREADY_SENT
    }
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, request.fileSize)
    if (start) {
      await flowEnc.setPosition(start)
    }
    await httpProxy(request, response, null, flowEnc.decryptTransform())
    return RESPONSE_ALREADY_SENT
  }
  await httpProxy(request, response)
  return RESPONSE_ALREADY_SENT
}
// 直接读取txt文件会用到
encName.get('/p/*', handleDownload)
encName.get('/d/*', handleDownload)

export default encName
