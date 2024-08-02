import Router from 'koa-router'

import { preProxy } from '@/utils/common'
import { alistServer, webdavServer } from '@/config'
import { encDavMiddleware } from '@/router/webdav/middlewares'
import { compose, proxyHandler } from '@/middleware/common'

const webdavRouter = new Router<EmptyObj>()

// 初始化webdav路由
webdavServer.forEach((webdavConfig) => {
  if (webdavConfig.enable) {
    webdavRouter.all(new RegExp(webdavConfig.path), compose(preProxy(webdavConfig, true), encDavMiddleware), proxyHandler)
  }
})

// 单独处理alist的所有/dav
webdavRouter.all(/^\/dav\/*/, compose(preProxy(alistServer, false), encDavMiddleware), proxyHandler)

export default webdavRouter
