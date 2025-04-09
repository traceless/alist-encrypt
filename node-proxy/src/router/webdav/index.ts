import Router from 'koa-router'

import { preProxy } from '@/utils/common'
import { alistServer, webdavServer } from '@/config'
import { webdavHookMiddleware } from '@/router/webdav/middlewares'

const webdavRouter = new Router<EmptyObj>()

// 初始化webdav路由
webdavServer.forEach((webdavConfig) => {
  if (webdavConfig.enable) {
    webdavRouter.all<ProxiedState<WebdavServer>, EmptyObj>(new RegExp(webdavConfig.path), preProxy(webdavConfig, true), webdavHookMiddleware)
  }
})

// 单独处理alist的所有/dav
// webdavRouter.all(/^\/dav\/*/, compose(preProxy(alistServer, false), encDavMiddleware), proxyHandler)
webdavRouter.all<ProxiedState<AlistServer>, EmptyObj>(/^\/dav\/*/, preProxy(alistServer, true), webdavHookMiddleware)

export default webdavRouter
