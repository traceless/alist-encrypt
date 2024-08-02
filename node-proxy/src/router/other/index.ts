import Router from 'koa-router'
import { flat, preProxy } from '@/utils/common'
import { alistServer, version } from '@/config'
import levelDB from '@/dao/levelDB'
import FlowEnc from '@/utils/flowEnc'
import { pathExec } from '@/utils/cryptoUtil'
import { httpClient, httpFlowClient } from '@/utils/httpClient'
import { logger } from '@/common/logger'
import { bodyParserMiddleware, compose, proxyHandler } from '@/middleware/common'
import { downloadMiddleware } from '@/router/other/utils'

const otherRouter = new Router()

otherRouter.get<ProxiedState<AlistServer>, EmptyObj>(
  /^\/d\/*/,
  compose(bodyParserMiddleware, preProxy(alistServer, false), downloadMiddleware),
  proxyHandler
)

otherRouter.get<ProxiedState<AlistServer>, EmptyObj>(
  /^\/p\/*/,
  compose(bodyParserMiddleware, preProxy(alistServer, false), downloadMiddleware),
  proxyHandler
)

// 修复alist 图标不显示的问题
otherRouter.all(/^\/images\/*/, compose(bodyParserMiddleware, preProxy(alistServer, false)), async (ctx) => {
  const state = ctx.state

  delete ctx.req.headers.host

  return await httpFlowClient({
    urlAddr: state.urlAddr,
    passwdInfo: state.passwdInfo,
    fileSize: state.fileSize,
    request: ctx.req,
    response: ctx.res,
  })
})

otherRouter.all('/redirect/:key', async (ctx) => {
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
  const start = range ? Number(range.replace('bytes=', '').split('-')[0]) : 0
  const decode = ctx.query.decode

  logger.info(`重定向: ${ctx.path} -> ${redirectUrl}, 解密${decode !== '0'}`)

  const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, fileSize)

  if (start) {
    await flowEnc.setPosition(start)
  }

  // 设置请求地址和是否要解密
  // 修改百度头
  if (~redirectUrl.indexOf('baidupcs.com')) {
    request.headers['User-Agent'] = 'pan.baidu.com'
  }
  request.url = decodeURIComponent(flat(ctx.query.lastUrl))
  delete request.headers.host
  delete request.headers.referer
  // 123网盘和天翼网盘多次302
  // authorization 是alist网页版的token，不是webdav的，这里修复天翼云无法获取资源的问题
  delete request.headers.authorization

  // 默认判断路径来识别是否要解密，如果有decode参数，那么则按decode来处理，这样可以让用户手动处理是否解密？(那还不如直接在alist下载)
  let decryptTransform = passwdInfo.enable && pathExec(passwdInfo.encPath, request.url) ? flowEnc.decryptTransform() : null
  if (decode) {
    decryptTransform = decode !== '0' ? flowEnc.decryptTransform() : null
  }
  // 请求实际服务资源
  await httpFlowClient({
    urlAddr: redirectUrl,
    passwdInfo,
    fileSize,
    request,
    response,
    decryptTransform,
  })
})

otherRouter.all<ProxiedState<AlistServer>, EmptyObj>(new RegExp(alistServer.path), preProxy(alistServer, false), async (ctx) => {
  let respBody = await httpClient({
    urlAddr: ctx.state.urlAddr,
    reqBody: JSON.stringify(ctx.request.body),
    request: ctx.req,
    response: ctx.res,
  })

  respBody = respBody.replace(
    '<body>',
    `<body>
    <div style="position: fixed;z-index:10010; top:7px; margin-left: 50%">
      <a target="_blank" href="/index">
        <div style="width:40px;height:40px;margin-left: -20px">
          <img style="width:40px;height:40px;" src="/public/logo.png" alt="logo"/>
          <div style="margin: -7px 2px;">
            <span style="color:gray;font-size:11px">V.${version}</span>
          </div>
        </div>
      </a>
    </div>`
  )
  ctx.body = respBody
})

export default otherRouter
