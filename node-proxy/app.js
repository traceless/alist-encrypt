'use strict'
import { convertFile } from './src/utils/convertFile'
const arg = process.argv.slice(2)
if (arg.length > 1) {
  // convertFile command
  convertFile(...arg)
  return
}

import Koa from 'koa'
import Router from 'koa-router'
import http from 'http'

import path from 'path'
import { httpProxy, httpClient } from '@/utils/httpClient'
import bodyparser from 'koa-bodyparser'
import FlowEnc from '@/utils/flowEnc'
import levelDB from '@/utils/levelDB'
import { webdavServer, alistServer, port, version } from '@/config'
import { pathExec, pathFindPasswd } from '@/utils/commonUtil'
import globalHandle from '@/middleware/globalHandle'
import encApiRouter from '@/router'
import encNameRouter from '@/encNameRouter'
import encDavHandle from '@/encDavHandle'

import staticServer from 'koa-static'
import { logger } from '@/common/logger'
import { encodeName } from '@/utils/commonUtil'

async function sleep(time) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve()
    }, time || 3000)
  })
}

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
  // authorization 是alist网页版的token，不是webdav的，这里修复天翼云无法获取资源的问题
  delete request.headers.authorization

  // 默认判断路径来识别是否要解密，如果有decode参数，那么则按decode来处理，这样可以让用户手动处理是否解密？(那还不如直接在alist下载)
  let decryptTransform = passwdInfo.enable && pathExec(passwdInfo.encPath, request.url) ? flowEnc.decryptTransform() : null
  if (decode) {
    decryptTransform = decode !== '0' ? flowEnc.decryptTransform() : null
  }
  // 请求实际服务资源
  await httpProxy(request, response, null, decryptTransform)
  logger.info('----finish redirect---', decode, request.urlAddr, decryptTransform === null)
})

// 预处理 request，处理地址，加密钥匙等
function preProxy(webdavConfig, isWebdav) {
  // 必包变量
  // let authorization = isWebdav
  return async (ctx, next) => {
    const { serverHost, serverPort, https } = webdavConfig
    const request = ctx.req
    if (isWebdav) {
      // 不能把authorization缓存起来，单线程
      request.isWebdav = isWebdav
      // request.headers.authorization = request.headers.authorization ? (authorization = request.headers.authorization) : authorization
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

  // 检查路径是否满足加密要求，要拦截的路径可能有中文
  const { pathInfo } = pathFindPasswd(passwdList, decodeURI(request.url))
  logger.info('@@webdavpasswdInfo', pathInfo)

  await httpProxy(request, response)
}
// 测试方法
async function proxyHandleTest(ctx, next) {
  // req 是nodejs原生对象
  const request = ctx.req
  const response = ctx.res
  logger.info('@request_data', request.url, request.headers)
  // const result = await http(request, response)
  let respBody = await httpProxy(ctx.req, ctx.res)
  // ctx.status = ctx.res.statusCode
  // ctx.body = respBody
  logger.info('@@request_log', request.urlAddr, response.statusCode, response.getHeaderNames())
}

// 初始化webdav路由，这里可以优化成动态路由，只不过没啥必要，修改配置后直接重启就好了
webdavServer.forEach((webdavConfig) => {
  if (webdavConfig.enable) {
    proxyRouter.all(new RegExp(webdavConfig.path), preProxy(webdavConfig, true), encDavHandle, proxyHandle)
  }
})

/* =================================== 单独处理alist的逻辑 ====================================== */

// 单独处理alist的所有/dav
proxyRouter.all(/^\/dav\/*/, preProxy(alistServer, true), encDavHandle, proxyHandle)

// 其他的代理request预处理，处理要跳转的路径等
proxyRouter.all(/\/*/, preProxy(alistServer, false))
// check enc filename
proxyRouter.use(encNameRouter.routes()).use(encNameRouter.allowedMethods())

// that is not work when upload txt file if enable encName
proxyRouter.put('/api/fs/put-back', async (ctx, next) => {
  const request = ctx.req
  const { headers, webdavConfig } = request
  const contentLength = headers['content-length'] || 0
  request.fileSize = contentLength * 1

  const uploadPath = headers['file-path'] ? decodeURI(headers['file-path']) : '/-'
  const { passwdInfo } = pathFindPasswd(webdavConfig.passwdList, uploadPath)
  if (passwdInfo) {
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, request.fileSize)
    return await httpProxy(ctx.req, ctx.res, flowEnc.encryptTransform())
  }
  return await httpProxy(ctx.req, ctx.res)
})

// 修复alist 图标不显示的问题
proxyRouter.all(/^\/images\/*/, async (ctx, next) => {
  delete ctx.req.headers.host
  return await httpProxy(ctx.req, ctx.res)
})

// 初始化alist的路由
proxyRouter.all(new RegExp(alistServer.path), async (ctx, next) => {
  let respBody = await httpClient(ctx.req, ctx.res)
  respBody = respBody.replace(
    '<body>',
    `<body>
    <div style="position: fixed;z-index:10010; top:7px; margin-left: 50%">
      <a target="_blank" href="/index">
        <div style="width:40px;height:40px;margin-left: -20px">
          <img style="width:40px;height:40px;" src="/public/logo.png" />
          <div style="margin: -7px 2px;">
            <span style="color:gray;font-size:11px">V.${version}</span>
          </div>
        </div>
      </a>
    </div>`
  )
  ctx.status = ctx.res.statusCode
  // ctx.body = respBody 会导致 statusCode = 200，所以上面要进行主动设置
  ctx.body = respBody
})
// 使用路由控制
app.use(proxyRouter.routes()).use(proxyRouter.allowedMethods())

// 配置创建好了，就启动 else {
const koaHandler = app.callback()
const server = http.createServer(koaHandler)
server.maxConnections = 1000

// 捕获带Expect:100-continue的PUT上传请求直接透传，本机不处理
server.on('checkContinue', (req, res) => {
  // 全部交给后端的webdav服务处理，修复群晖webdav的问题
  koaHandler(req, res)
})

server.listen(port, () => logger.info('服务启动成功: ' + port))
setInterval(() => {
  logger.debug('server_connections', server._connections, Date.now())
}, 600 * 1000)

