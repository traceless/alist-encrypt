'use strict'
// CLI模式: node app.js <password> <encType> <operation> <folder> <outPath> [encName]
// 服务模式: node app.js
import { convertFile } from './src/utils/convertFile.js'
import { Hono } from 'hono'
import { getRequestListener } from '@hono/node-server'
import { RESPONSE_ALREADY_SENT } from '@hono/node-server/utils/response'
import { serveStatic } from '@hono/node-server/serve-static'
import http from 'http'

import path from 'path'
import { httpProxy, httpClient } from './src/utils/httpClient.js'
import FlowEnc from './src/utils/flowEnc.js'
import levelDB from './src/utils/levelDB.js'
import { webdavServer, alistServer, port, version } from './src/config.js'
import { pathExec, pathFindPasswd } from './src/utils/commonUtil.js'
import globalHandle from './src/middleware/globalHandle.js'
import encApiRouter from './src/router.js'
import encNameRouter from './src/encNameRouter.js'
import encDavHandle from './src/encDavHandle.js'

import { logger } from './src/common/logger.js'

const arg = process.argv.slice(2)
if (arg.length > 1) {
  // convertFile command
  convertFile(...arg)
} else {
  // 启动代理服务
  startupServer()
}

function startupServer() {
  const app = new Hono()
  // compatible ncc and pkg
  const pkgDirPath = path.dirname(process.argv[1])

  // ======================静态资源与全局异常兜底==============================
  app.use('/public/*', serveStatic({ root: pkgDirPath }))
  // Hono 的 compose 内建 onError，异常不会冒泡到普通中间件的 try-catch，必须用 app.onError 接管
  app.onError(globalHandle)

  // ======================/enc-api 是本服务的管理接口==============================
  app.route('/', encApiRouter)

  // =======================下面是实现webdav代理的业务==============================

  // 可能是302跳转过来的下载的,/redirect?key=34233&decode=0
  app.all('/redirect/:key', async (c) => {
    const request = c.env.incoming
    const response = c.env.outgoing
    // 这里还是要encodeURIComponent ，因为http服务器会自动对url进行decodeURIComponent
    const data = await levelDB.getValue(c.req.param('key'))
    if (data === null) {
      return c.text('no found')
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
    const decode = c.req.query('decode')
    // 修改百度头
    if (~redirectUrl.indexOf('baidupcs.com')) {
      request.headers['User-Agent'] = 'pan.baidu.com'
    }
    request.url = decodeURIComponent(c.req.query('lastUrl'))
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
    return RESPONSE_ALREADY_SENT
  })

  // 预处理 request，处理地址，加密钥匙等
  function preProxy(webdavConfig, isWebdav) {
    return async (c, next) => {
      const { serverHost, serverPort, https } = webdavConfig
      const request = c.env.incoming
      if (isWebdav) {
        // 不能把authorization缓存起来，单线程
        request.isWebdav = isWebdav
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
  async function proxyHandle(c) {
    const request = c.env.incoming
    const response = c.env.outgoing
    const { passwdList } = request.webdavConfig
    // 检查路径是否满足加密要求，要拦截的路径可能有中文
    const { pathInfo } = pathFindPasswd(passwdList, decodeURI(request.url))
    logger.info('@@webdavpasswdInfo', pathInfo)
    await httpProxy(request, response)
    return RESPONSE_ALREADY_SENT
  }

  // 组合执行webdav处理链: preProxy -> encDavHandle -> proxyHandle
  async function davChain(c, webdavConfig) {
    await preProxy(webdavConfig, true)(c, async () => {})
    return await encDavHandle(c, async () => proxyHandle(c))
  }

  // webdav路由匹配，Hono不支持动态RegExp路由，这里按配置顺序手动匹配
  // 匹配顺序与原koa-router注册顺序一致：webdav配置路径 -> /dav -> 其余路径做alist预处理
  app.all('*', async (c, next) => {
    const reqPath = c.req.path
    for (const webdavConfig of webdavServer) {
      if (webdavConfig.enable && new RegExp(webdavConfig.path).test(reqPath)) {
        return await davChain(c, webdavConfig)
      }
    }
    // 单独处理alist的所有/dav
    if (/^\/dav\/*/.test(reqPath)) {
      return await davChain(c, alistServer)
    }
    // 其他的代理request预处理，处理要跳转的路径等
    await preProxy(alistServer, false)(c, next)
  })

  /* =========================== 单独处理alist的逻辑 ============================== */

  // 拦截alist的http接口，处理加密文件名等
  app.route('/', encNameRouter)

  // 修复alist 图标不显示的问题
  app.all('/images/*', async (c) => {
    delete c.env.incoming.headers.host
    await httpProxy(c.env.incoming, c.env.outgoing)
    return RESPONSE_ALREADY_SENT
  })

  // 初始化alist的路由（等价原 new RegExp(alistServer.path) 兜底路由）
  app.all('*', async (c) => {
    if (!new RegExp(alistServer.path).test(c.req.path)) {
      return c.text('Not Found', 404)
    }
    const request = c.env.incoming
    const response = c.env.outgoing
    let respBody = await httpClient(request, response)
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
    // 等价 koa: ctx.status = ctx.res.statusCode; ctx.body = respBody，body变化后需重算Content-Length
    // 移除透传的 transfer-encoding（上游 chunked），避免 TE+CL 并存的非法头
    response.removeHeader('transfer-encoding')
    response.setHeader('content-length', Buffer.byteLength(respBody))
    response.end(respBody)
    return RESPONSE_ALREADY_SENT
  })

  // 配置创建好了，就启动
  const nodeHandler = getRequestListener(app.fetch)
  const server = http.createServer(nodeHandler)
  server.maxConnections = 1000

  // 捕获带Expect:100-continue的PUT上传请求直接透传，本机不处理
  server.on('checkContinue', (req, res) => {
    // 全部交给后端的webdav服务处理，修复群晖webdav的问题
    nodeHandler(req, res)
  })

  server.listen(port, () => logger.info('服务启动成功: ' + port))
  setInterval(() => {
    logger.debug('server_connections', server._connections, Date.now())
  }, 600 * 1000)
}
