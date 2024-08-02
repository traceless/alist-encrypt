import type { Middleware } from 'koa'

//平整化
export const flat = <T>(value: T | T[]): T => {
  return Array.isArray(value) ? value[0] : value
}

//存储请求的部分原始信息，供代理使用
export function preProxy(serverConfig: WebdavServer, isWebdav: true): Middleware
export function preProxy(serverConfig: AlistServer, isWebdav: false): Middleware
export function preProxy(serverConfig: WebdavServer | AlistServer, isWebdav: boolean): Middleware {
  return async (ctx, next) => {
    const { serverHost, serverPort, https } = serverConfig

    if (isWebdav) {
      // 不能把authorization缓存起来，单线程
      ctx.state.isWebdav = isWebdav
      // request.headers.authorization = request.headers.authorization ? (authorization = request.headers.authorization) : authorization
    }

    const request = ctx.request
    const protocol = https ? 'https' : 'http'

    ctx.state.selfHost = request.headers.host // 原来的host保留，以后可能会用到
    ctx.state.origin = request.headers.origin
    request.headers.host = serverHost + ':' + serverPort
    ctx.state.urlAddr = `${protocol}://${request.headers.host}${request.url}`
    ctx.state.serverAddr = `${protocol}://${request.headers.host}`
    ctx.state.serverConfig = serverConfig

    await next()
  }
}

export const sleep = (time: number) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve()
    }, time || 3000)
  })
}
