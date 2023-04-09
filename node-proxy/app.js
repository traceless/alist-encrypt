'use strict'

import Koa from 'koa'
import Router from 'koa-router'
import http from 'http'
import crypto from 'crypto'
import path from 'path'
import { httpProxy, httpClient } from './src/utils/httpClient.js'
import bodyparser from 'koa-bodyparser'
import FlowEnc from './src/utils/flowEnc.js'
import levelDB from './src/utils/levelDB.js'
import { webdavServer, alistServer, port } from './src/config.js'
import { pathExec, pathFindPasswd } from './src/utils/commonUtil.js'
import globalHandle from './src/middleware/globalHandle.js'
import encApiRouter from './src/router.js'
import encNameRouter from './src/encNameRouter.js'
import { cacheFileInfo, getFileInfo } from './src/dao/fileDao.js'
import { getWebdavFileInfo } from './src/utils/webdavClient.js'
import { convertFile } from './src/utils/convertFile.js'
import staticServer from 'koa-static'

const proxyRouter = new Router()
const app = new Koa()
// compatible ncc and pkg
const pkgDirPath = path.dirname(process.argv[1])

app.use(staticServer(pkgDirPath, 'public'))
app.use(globalHandle)
// bodyparser解析body
const bodyparserMw = bodyparser({ enableTypes: ['json', 'form', 'text'] })

// ======================/proxy是实现本服务的业务==============================
// 短地址
encApiRouter.redirect('/index', '/public/index.html', 302)
app.use(encApiRouter.routes()).use(encApiRouter.allowedMethods())

// ======================下面是实现webdav代理的业务==============================

// 可能是302跳转过来的下载的,/redirect?key=34233&decode=0
proxyRouter.all('/redirect/:key', async (ctx) => {
  const request = ctx.req
  const response = ctx.res
  // 这里还是要encodeURIComponent ，因为http服务器会自动对url进行decodeURIComponent
  const data = await levelDB.getValue(ctx.params.key)
  if (data === null) {
    ctx.body = 'no found'
    return
  }
  const { passwdInfo, redirectUrl, fileSize } = data
  // 要定位请求文件的位置 bytes=98304-
  const range = request.headers.range
  const start = range ? range.replace('bytes=', '').split('-')[0] * 1 : 0
  const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, fileSize)
  if (start) {
    await flowEnc.setPosition(start)
  }
  // 设置请求地址和是否要解密
  const decode = ctx.query.decode
  // 修改百度头
  if (~redirectUrl.indexOf('baidupcs.com')) {
    request.headers['User-Agent'] = 'pan.baidu.com'
  }
  request.url = decodeURIComponent(ctx.query.lastUrl)
  request.urlAddr = redirectUrl
  delete request.headers.host
  // aliyun不允许这个referer，不然会出现403
  delete request.headers.referer
  request.passwdInfo = passwdInfo
  // 123网盘和天翼网盘多次302
  request.fileSize = fileSize
  // 默认判断路径来识别是否要解密，如果有decode参数，那么则按decode来处理，这样可以让用户手动处理是否解密？(那还不如直接在alist下载)
  let decryptTransform = passwdInfo.enable && pathExec(passwdInfo.encPath, request.url) ? flowEnc.decryptTransform() : null
  if (decode) {
    decryptTransform = decode !== '0' ? flowEnc.decryptTransform() : null
  }
  flowEnc.cachePosition()
  // 请求实际服务资源
  await httpProxy(request, response, null, decryptTransform)
  console.log('----finish redirect---', decode, request.urlAddr, decryptTransform === null)
})

// 预处理 request，处理地址，加密钥匙等
function preProxy(webdavConfig, isWebdav) {
  let authorization = isWebdav
  return async (ctx, next) => {
    const { serverHost, serverPort, https } = webdavConfig
    const request = ctx.req
    if (authorization) {
      // 缓存起来，提高webdav的请求效率
      request.isWebdav = isWebdav
      request.headers.authorization = request.headers.authorization ? (authorization = request.headers.authorization) : authorization
    }
    // 原来的host保留，以后可能会用到
    request.selfHost = request.headers.host
    request.origin = request.headers.origin
    request.headers.host = serverHost + ':' + serverPort
    const protocol = https ? 'https' : 'http'
    request.urlAddr = `${protocol}://${request.headers.host}${request.url}`
    request.serverAddr = `${protocol}://${request.headers.host}`
    request.webdavConfig = webdavConfig
    await next()
  }
}
// webdav or http handle
async function proxyHandle(ctx, next) {
  const request = ctx.req
  const response = ctx.res
  const { passwdList } = request.webdavConfig
  const { headers } = request
  // 要定位请求文件的位置 bytes=98304-
  const range = headers.range
  const start = range ? range.replace('bytes=', '').split('-')[0] * 1 : 0
  // 检查路径是否满足加密要求，要拦截的路径可能有中文
  const { passwdInfo, pathInfo } = pathFindPasswd(passwdList, decodeURIComponent(request.url))
  console.log('@@@@passwdInfo', pathInfo)
  // fix webdav move file
  if (request.method.toLocaleUpperCase() === 'MOVE' && headers.destination) {
    let destination = headers.destination
    destination = request.serverAddr + destination.substring(destination.indexOf(path.dirname(request.url)), destination.length)
    request.headers.destination = destination
  }
  // 如果是上传文件，那么进行流加密，目前只支持webdav上传，如果alist页面有上传功能，那么也可以兼容进来
  if (request.method.toLocaleUpperCase() === 'PUT' && passwdInfo) {
    // 兼容macos的webdav客户端x-expected-entity-length
    const contentLength = headers['content-length'] || headers['x-expected-entity-length'] || 0
    request.fileSize = contentLength * 1
    // 需要知道文件长度，等于0 说明不用加密，这个来自webdav奇怪的请求
    if (request.fileSize === 0) {
      return await httpProxy(request, response)
    }
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, request.fileSize)
    return await httpProxy(request, response, flowEnc.encryptTransform())
  }
  // 如果是下载文件，那么就进行判断是否解密
  if (~'GET,HEAD,POST'.indexOf(request.method.toLocaleUpperCase()) && passwdInfo) {
    // 根据文件路径来获取文件的大小
    const urlPath = ctx.req.url.split('?')[0]
    let filePath = urlPath
    // 如果是alist的话，那么必然有这个文件的size缓存（进过list就会被缓存起来）
    request.fileSize = 0
    // 这里需要处理掉/p 路径
    if (filePath.indexOf('/p/') === 0) {
      filePath = filePath.replace('/p/', '/')
    }
    if (filePath.indexOf('/d/') === 0) {
      filePath = filePath.replace('/d/', '/')
    }
    const fileInfo = await getFileInfo(filePath)
    console.log('@@getFileInfo:', filePath, fileInfo, request.urlAddr)
    if (fileInfo) {
      request.fileSize = fileInfo.size * 1
    } else if (request.headers.authorization) {
      // 这里要判断是否webdav进行请求, 这里默认就是webdav请求了
      const authorization = request.headers.authorization
      const webdavFileInfo = await getWebdavFileInfo(request.urlAddr, authorization)
      console.log('@@webdavFileInfo:', filePath, webdavFileInfo)
      if (webdavFileInfo) {
        webdavFileInfo.path = filePath
        // 某些get请求返回的size=0，不要缓存起来
        if (webdavFileInfo.size * 1 > 0) {
          cacheFileInfo(webdavFileInfo)
        }
        request.fileSize = webdavFileInfo.size * 1
      }
    }
    request.passwdInfo = passwdInfo
    // console.log('@@@@request.filePath ', request.filePath, result)
    if (request.fileSize === 0) {
      // 说明不用加密
      return await httpProxy(request, response)
    }
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, request.fileSize)
    // if he get the video , cache position
    flowEnc.cachePosition()
    if (start) {
      await flowEnc.setPosition(start)
    }
    return await httpProxy(request, response, null, flowEnc.decryptTransform())
  }
  await httpProxy(request, response)
}

// 初始化webdav路由，这里可以优化成动态路由，只不过没啥必要，修改配置后直接重启就好了
webdavServer.forEach((webdavConfig) => {
  if (webdavConfig.enable) {
    proxyRouter.all(new RegExp(webdavConfig.path), preProxy(webdavConfig, true), proxyHandle)
  }
})

/* =================================== 单独处理alist的逻辑 ====================================== */

// 先处理webdav，然后再处理普通的http
proxyRouter.all(/\/dav\/*/, preProxy(alistServer, true), proxyHandle)

// 其他的代理request预处理，处理要跳转的路径等
proxyRouter.all(/\/*/, preProxy(alistServer, false))
// check enc filename
proxyRouter.use(encNameRouter.routes()).use(encNameRouter.allowedMethods())

// 处理文件下载的302跳转
proxyRouter.get(/\/d\/*/, proxyHandle)
// 文件直接下载
proxyRouter.get(/\/p\/*/, proxyHandle)

// 处理在线视频播放的问题，修改它的返回播放地址 为本代理的地址。
proxyRouter.all('/api/fs/get', bodyparserMw, async (ctx, next) => {
  const { path } = ctx.request.body
  // 判断打开的文件是否要解密，要解密则替换url，否则透传
  ctx.req.reqBody = JSON.stringify(ctx.request.body)

  const respBody = await httpClient(ctx.req)
  const result = JSON.parse(respBody)
  const { headers } = ctx.req
  const { passwdInfo } = pathFindPasswd(alistServer.passwdList, path)

  if (passwdInfo) {
    // 修改返回的响应，匹配到要解密，就302跳转到本服务上进行代理流量
    console.log('@@getFile ', path, ctx.req.reqBody, result)
    const key = crypto.randomUUID()
    await levelDB.setExpire(key, { redirectUrl: result.data.raw_url, passwdInfo, fileSize: result.data.size }, 60 * 60 * 72) // 缓存起来，默认3天，足够下载和观看了
    result.data.raw_url = `${headers.origin}/redirect/${key}?decode=1&lastUrl=${encodeURIComponent(path)}`
  }
  ctx.body = result
})

// 缓存alist的文件信息
proxyRouter.all('/api/fs/list', bodyparserMw, async (ctx, next) => {
  const { path } = ctx.request.body
  // 判断打开的文件是否要解密，要解密则替换url，否则透传
  ctx.req.reqBody = JSON.stringify(ctx.request.body)
  const respBody = await httpClient(ctx.req)
  // console.log('@@@respBody', respBody)
  const result = JSON.parse(respBody)
  if (!result.data) {
    ctx.body = result
    return
  }
  const content = result.data.content
  if (!content) {
    ctx.body = result
    return
  }
  for (let i = 0; i < content.length; i++) {
    const fileInfo = content[i]
    fileInfo.path = encodeURI(path + '/' + fileInfo.name)
    // 这里要注意闭包问题，mad
    console.log('@@cacheFileInfo', fileInfo.path)
    await cacheFileInfo(fileInfo)
  }
  ctx.body = result
})

// 处理网页上传文件
proxyRouter.put('/api/fs/put', async (ctx, next) => {
  const request = ctx.req
  const { headers, webdavConfig } = request
  const contentLength = headers['content-length'] || 0
  request.fileSize = contentLength * 1

  const uploadPath = headers['file-path'] ? decodeURIComponent(headers['file-path']) : '/-'
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, uploadPath)
  if (passwdInfo) {
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, request.fileSize)
    return await httpProxy(ctx.req, ctx.res, flowEnc.encryptTransform())
  }
  return await httpProxy(ctx.req, ctx.res)
})

// 初始化alist的路由
proxyRouter.all(new RegExp(alistServer.path), async (ctx, next) => {
  let respBody = await httpClient(ctx.req, ctx.res)
  respBody = respBody.replace(
    '<body>',
    `<body><div style="position: fixed;z-index:10010; top:8px; margin-left: 50%">
      <a target="_blank" href="/index">
        <div style="width:100px;height:50px">
          <img style="width:40px;height:40px;" src="/public/logo.png" />
        </div>
      </a>
    </div>`
  )
  ctx.body = respBody
})
// 使用路由控制
app.use(proxyRouter.routes()).use(proxyRouter.allowedMethods())

// 配置创建好了，就启动
const arg = process.argv.slice(2)
if (arg.length > 1) {
  // convertFile command
  convertFile(arg)
} else {
  const server = http.createServer(app.callback())
  server.maxConnections = 1000
  server.listen(port, () => console.log('服务启动成功: ' + port))
  setInterval(() => {
    console.log('server_connections', server._connections, Date.now())
  }, 600 * 1000)
}
