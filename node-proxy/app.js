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

const webdavRouter = new Router()
const restRouter = new Router()
const app = new Koa()

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
  console.log('@@redirect_url: ', request.url, redirectUrl)
  // 设置请求地址和是否要解密
  const decode = ctx.query.decode
  const flowEnc = new FlowEnc(webdavConfig.flowPassword)
  request.url = decodeURIComponent(ctx.query.lastUrl)
  request.urlAddr = redirectUrl
  delete request.headers.host
  // aliyun不允许这个referer，不然会出现403
  delete request.headers.referer
  request.webdavConfig = webdavConfig
  // 默认判断路径来识别是否要解密，如果有decode参数，那么则按decode来处理，这样可以让用户手动处理是否解密
  let decodeTransform = pathExec(webdavConfig.encPath, request.url) ? flowEnc.decodeTransform() : null
  if (decode) {
    decodeTransform = decode !== '0' ? flowEnc.decodeTransform() : null
  }
  // 请求实际服务资源
  await httpProxy(request, response, null, decodeTransform)
  console.log('----finish redirect---', decode, request.urlAddr, decodeTransform === null)
})

// 创建webdav的proxy处理逻辑，闭包方式
function proxyInit(webdavConfig, webdavProxy) {
  const { serverHost, serverPort, flowPassword, encPath } = webdavConfig
  const flowEnc = new FlowEnc(flowPassword)
  let authorization = webdavProxy
  return async (ctx, next) => {
    const request = ctx.req
    const response = ctx.res
    if (authorization) {
      // 缓存起来，提高效率
      request.headers.authorization = request.headers.authorization ? (authorization = request.headers.authorization) : authorization
    }
    request.headers.host = serverHost + ':' + serverPort
    request.urlAddr = `http://${request.headers.host}${request.url}`
    request.webdavConfig = webdavConfig
    const { method, headers, urlAddr } = request
    console.log('@@request_info: ', method, urlAddr, headers)
    // 如果是上传文件，那么进行流加密，目前只支持webdav上传，如果alist页面有上传功能，那么也可以兼容进来
    if (request.method.toLocaleUpperCase() === 'PUT') {
      // 单独处理 alist：/api/fs/put
      const uploadPath = headers['file-path'] ? decodeURIComponent(headers['file-path']) : '/-'
      if (pathExec(encPath, request.url) || pathExec(encPath, uploadPath)) {
        return await httpProxy(request, response, flowEnc.encodeTransform())
      }
      return await httpProxy(request, response, flowEnc.encodeTransform())
    }
    // 如果是下载文件，那么就进行判断是否解密
    if (~'GET,HEAD,POST'.indexOf(request.method.toLocaleUpperCase()) && pathExec(encPath, request.url)) {
      return await httpProxy(request, response, null, flowEnc.decodeTransform())
    }
    await httpProxy(request, response)
  }
}
// 初始化webdav路由，这里可以优化成动态路由，只不过没啥必要，修改配置后直接重启就好了
webdavServer.forEach((webdavConfig) => {
  if (webdavConfig.enable) {
    webdavRouter.all(new RegExp(webdavConfig.path), proxyInit(webdavConfig, true))
  }
})

/* =================================== 单独处理alist的逻辑====================================== */

// 初始化alist的路由，新增/d/* 路由
const downloads = []
for (const key in alistServer.encPath) {
  downloads.push('/d' + alistServer.encPath[key])
  downloads.push('/dav' + alistServer.encPath[key])
}
alistServer.encPath = alistServer.encPath.concat(downloads)
// 处理在线视频播放的问题
webdavRouter.all('/api/fs/get', bodyparserMw, async (ctx, next) => {
  const request = ctx.req
  const response = ctx.res
  const { path } = ctx.request.body
  request.headers.host = alistServer.serverHost + ':' + alistServer.serverPort
  request.urlAddr = `http://${request.headers.host}${request.url}`
  request.webdavConfig = alistServer
  request.reqBody = JSON.stringify(ctx.request.body)
  // 判断打开的文件是否要解密，要解密则替换url，否则透传
  const respBody = await httpClient(request, response)
  const result = JSON.parse(respBody)
  if (pathExec(alistServer.encPath, path)) {
    // 修改返回的响应，匹配到要解密，就302跳转到本服务上进行代理流量
    console.log('@@getFile ', path, result)
    const key = crypto.randomUUID()
    await levelDB.putValue(key, { redirectUrl: result.data.raw_url, webdavConfig: alistServer }, 60 * 60 * 72) // 缓存起来，默认3天，足够下载和观看了
    result.data.raw_url = `/redirect/${key}?decode=1&lastUrl=${encodeURIComponent(path)}`
  }
  ctx.body = result
})
// 初始化alist的路由
webdavRouter.all(new RegExp(alistServer.path), proxyInit(alistServer))
// 使用路由控制
app.use(webdavRouter.routes()).use(webdavRouter.allowedMethods())

const server = http.createServer(app.callback())
server.maxConnections = 1000
const port = 5344
server.listen(port, () => console.log('服务启动成功: ' + port))
setInterval(() => {
  console.log('server_connections', server._connections)
}, 5000)
