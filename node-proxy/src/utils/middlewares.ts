import path from 'path'

import bodyparser from 'koa-bodyparser'
import type { Middleware, Next, ParameterizedContext } from 'koa'

import { logger } from '@/common/logger'

export const compose = (...middlewares: Middleware[]): Middleware => {
  if (!Array.isArray(middlewares)) throw new TypeError('Middleware stack must be an array!')
  for (const fn of middlewares) {
    if (typeof fn !== 'function') throw new TypeError('Middleware must be composed of functions!')
  }

  // 最后一个中间件需要调用 next() 来确保响应可以结束
  return function (context, next) {
    // 创建一个新的函数，这个函数会依次调用中间件
    let index = -1

    function dispatch(i: number) {
      if (i <= index) return Promise.reject(new Error('next() called multiple times'))
      index = i

      let fn = middlewares[i]
      if (i === middlewares.length) fn = next // 如果没有更多中间件，则调用原始的 next()

      if (!fn) return Promise.resolve()

      try {
        return Promise.resolve(fn(context, dispatch.bind(null, i + 1)))
      } catch (err) {
        return Promise.reject(err)
      }
    }

    return dispatch(0) // 开始执行第一个中间件
  }
}

export const emptyMiddleware: Middleware = async (_, next) => {
  await next()
}

export const loggerMiddleware: Middleware = async (ctx, next) => {
  const reqPath = decodeURIComponent(ctx.path)

  let show = true
  if (reqPath.startsWith('/public')) {
    show = false
  }

  if (['.html', '.js', '.css', '.json'].includes(path.extname(reqPath))) {
    show = false
  }

  if (show) {
    logger.info(`-------------------开始 ${reqPath}-------------------`)
  }

  await next()

  if (show) {
    logger.info(`-------------------结束 ${reqPath}-------------------`)
  }
}

export const bodyParserMiddleware = bodyparser({ enableTypes: ['json', 'form', 'text'] })

export const exceptionMiddleware: Middleware = async (
  ctx: ParameterizedContext<
    EmptyObj,
    EmptyObj,
    {
      code: number
      success: boolean
      message: string
    }
  >,
  next: Next
) => {
  try {
    await next()
    if (ctx.status === 404) {
      if (ctx.state?.isWebdav) {
        logger.warn(ctx.state?.urlAddr, '404')
      } else {
        ctx.throw(404, '请求资源未找到!')
      }
    }
  } catch (err) {
    logger.error(err)

    const status = err.status || 500
    // 生产环境时 500 错误的详细错误内容不返回给客户端，因为可能包含敏感信息
    const error = status === 500 && process.env.RUN_MODE === 'DEV' ? err.message : 'Internal Server Error'
    // 从 error 对象上读出各个属性，设置到响应中
    ctx.body = {
      success: false,
      message: error,
      code: status, // 服务端自身的处理逻辑错误(包含框架错误500 及 自定义业务逻辑错误533开始 ) 客户端请求参数导致的错误(4xx开始)，设置不同的状态码
    }
    // 406 是能让用户看到的错误，参数校验失败也不能让用户看到（一般不存在参数校验失败）
    if (status === 403 || status === 406) {
      ctx.body.message = error
    }
    ctx.status = 200
  }
}
