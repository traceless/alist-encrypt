'use strict'

import Koa from 'koa'
import Router from 'koa-router'
import http from 'http'
import crypto from 'crypto'
import { httpProxy, httpClient } from './utils/httpClient.js'
import bodyparser from 'koa-bodyparser'
import FlowEnc from './utils/flowEnc.js'
import levelDB from './utils/levelDB.js'
import { webdavServer, alistServer } from './config.js'
import { pathExec } from './utils/commonUtil.js'
import globalHandle from './middleware/globalHandle.js'

const webdavRouter = new Router()
const restRouter = new Router()
const app = new Koa()
app.use(globalHandle)

// ======================/proxy是实现本服务的业务==============================

// bodyparser解析body
const bodyparserMw = bodyparser({ enableTypes: ['json', 'form', 'text'] })
restRouter.all(/\/enc-api\/*/, bodyparserMw)
// 拦截自己服务路径
restRouter.all('/enc-api/config', async (ctx) => {
  console.log('------proxy------', ctx.req.url)
  ctx.body = { success: true }
})
app.use(restRouter.routes()).use(restRouter.allowedMethods())

// ======================下面是实现webdav代理的业务==============================

// 可能是302跳转过来的下载的,/redirect?key=34233&decode=0
webdavRouter.all('/redirect/:key', async (ctx) => {
  const request = ctx.req
  const response = ctx.res
  // 这里还是要encodeURIComponent ，因为http服务器会自动对url进行decodeURIComponent
  const data = await levelDB.getValue(ctx.params.key)
  if (data === null) {
    ctx.body = 'no found'
    return
  }
  const { webdavConfig, redirectUrl } = data
  // 要定位请求文件的位置 bytes=98304-
  const range = request.headers.range
  const start = range ? range.replace('bytes=', '').split('-')[0] * 1 : 0
  const flowEnc = new FlowEnc(webdavConfig.flowPassword, webdavConfig.encryptType, 0)
  if (start) {
    await flowEnc.setPosition(start)
  }
  console.log('@@redirect_url: ', request.url, redirectUrl)
  // 设置请求地址和是否要解密
  const decode = ctx.query.decode

  request.url = decodeURIComponent(ctx.query.lastUrl)
  request.urlAddr = redirectUrl
  delete request.headers.host
  // aliyun不允许这个referer，不然会出现403
  delete request.headers.referer
  request.webdavConfig = webdavConfig
  // 默认判断路径来识别是否要解密，如果有decode参数，那么则按decode来处理，这样可以让用户手动处理是否解密
  let decryptTransform = pathExec(webdavConfig.encPath, request.url) ? flowEnc.decryptTransform() : null
  if (decode) {
    decryptTransform = decode !== '0' ? flowEnc.decryptTransform() : null
  }
  // 请求实际服务资源
  await httpProxy(request, response, null, decryptTransform)
  console.log('----finish redirect---', decode, request.urlAddr, decryptTransform === null)
})

// 预处理 request
function preProxy(webdavConfig, isProxy) {
  const { serverHost, serverPort, flowPassword, encPath, encryptType } = webdavConfig
  let authorization = isProxy
  return async (ctx, next) => {
    const request = ctx.req
    if (authorization) {
      // 缓存起来，提高webdav的请求效率
      request.headers.authorization = request.headers.authorization ? (authorization = request.headers.authorization) : authorization
    }
    // 原来的host保留，以后可能会用到
    request.host = request.headers.host
    request.origin = request.headers.origin
    request.headers.host = serverHost + ':' + serverPort
    request.urlAddr = `http://${request.headers.host}${request.url}`
    request.webdavConfig = webdavConfig
    // 要定位请求文件的位置 bytes=98304-
    const range = request.headers.range
    const start = range ? range.replace('bytes=', '').split('-')[0] * 1 : 0
    const flowEnc = new FlowEnc(flowPassword, encryptType, 0)
    if (start) {
      await flowEnc.setPosition(start)
    }
    request.flowEnc = flowEnc
    request.encPath = encPath
    await next()
  }
}
// webdav代理处理
async function webdavHandle(ctx, next) {
  const request = ctx.req
  const response = ctx.res
  const { serverHost, serverPort } = request.webdavConfig
  request.headers.host = serverHost + ':' + serverPort
  const { flowEnc, encPath } = request
  // 如果是上传文件，那么进行流加密，目前只支持webdav上传，如果alist页面有上传功能，那么也可以兼容进来
  if (request.method.toLocaleUpperCase() === 'PUT' && pathExec(encPath, request.url)) {
    return await httpProxy(request, response, flowEnc.encryptTransform())
  }
  // 如果是下载文件，那么就进行判断是否解密
  if (~'GET,HEAD,POST'.indexOf(request.method.toLocaleUpperCase()) && pathExec(encPath, request.url)) {
    return await httpProxy(request, response, null, flowEnc.decryptTransform())
  }
  await httpProxy(request, response)
}

// 初始化webdav路由，这里可以优化成动态路由，只不过没啥必要，修改配置后直接重启就好了
webdavServer.forEach((webdavConfig) => {
  if (webdavConfig.enable) {
    webdavRouter.all(new RegExp(webdavConfig.path), preProxy(webdavConfig, true), webdavHandle)
  }
})

/* =================================== 单独处理alist的逻辑====================================== */

// 初始化alist的路由，新增/d/* 路由
const downloads = []
for (const key in alistServer.encPath) {
  downloads.push('/d' + alistServer.encPath[key])
  downloads.push('/p' + alistServer.encPath[key])
  downloads.push('/dav' + alistServer.encPath[key])
}
alistServer.encPath = alistServer.encPath.concat(downloads)
// 先处理webdav，然后再处理普通的http
webdavRouter.all(/\/dav\/*/, preProxy(alistServer, true), webdavHandle)

// 其他的代理request预处理，处理要跳转的路径等
webdavRouter.all(/\/*/, preProxy(alistServer, false))

// 处理文件下载的302跳转
webdavRouter.get(/\/d\/*/, webdavHandle)
webdavRouter.get(/\/p\/*/, webdavHandle)

// 处理在线视频播放的问题，只有它需要处理 bodyparserMw
webdavRouter.all('/api/fs/get', bodyparserMw, async (ctx, next) => {
  const { path } = ctx.request.body
  // 判断打开的文件是否要解密，要解密则替换url，否则透传
  ctx.req.reqBody = JSON.stringify(ctx.request.body)
  const respBody = await httpClient(ctx.req, ctx.res)
  const result = JSON.parse(respBody)
  const { headers } = ctx.req
  console.log('@@@@origin', headers.origin)
  if (pathExec(alistServer.encPath, path)) {
    // 修改返回的响应，匹配到要解密，就302跳转到本服务上进行代理流量
    console.log('@@getFile ', path, result)
    const key = crypto.randomUUID()
    await levelDB.putValue(key, { redirectUrl: result.data.raw_url, webdavConfig: alistServer }, 60 * 60 * 72) // 缓存起来，默认3天，足够下载和观看了
    result.data.raw_url = `${headers.origin}/redirect/${key}?decode=1&lastUrl=${encodeURIComponent(path)}`
  }
  ctx.body = result
})

// 处理网页上传文件
webdavRouter.put('/api/fs/put', async (ctx, next) => {
  const { headers, flowEnc, encPath } = ctx.req
  const uploadPath = headers['file-path'] ? decodeURIComponent(headers['file-path']) : '/-'
  if (pathExec(encPath, uploadPath)) {
    return await httpProxy(ctx.req, ctx.res, flowEnc.encryptTransform())
  }
  return await httpProxy(ctx.req, ctx.res)
})

// 初始化alist的路由
webdavRouter.all(new RegExp(alistServer.path), async (ctx, next) => {
  await httpProxy(ctx.req, ctx.res)
})
// 使用路由控制
app.use(webdavRouter.routes()).use(webdavRouter.allowedMethods())

const server = http.createServer(app.callback())
server.maxConnections = 1000
const port = 5344
server.listen(port, () => console.log('服务启动成功: ' + port))
setInterval(() => {
  console.log('server_connections', server._connections)
}, 8000)
