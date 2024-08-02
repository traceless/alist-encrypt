import path from 'path'
import type { Transform } from 'stream'

import bodyparser from 'koa-bodyparser'
import type { Middleware, Next, ParameterizedContext } from 'koa'

import FlowEnc from '@/utils/flowEnc'
import { flat } from '@/utils/common'
import { logger } from '@/common/logger'
import { httpFlowClient } from '@/utils/httpClient'
import { getWebdavFileInfo } from '@/utils/webdavClient'
import { cacheFileInfo, getFileInfo } from '@/dao/fileDao'
import { encodeName, pathFindPasswd } from '@/utils/cryptoUtil'

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

  if (['.html', '.js', '.css'].includes(path.extname(reqPath))) {
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
      ctx.throw(404, '请求资源未找到!')
    }
  } catch (err) {
    logger.error('@@err')
    console.trace(err)

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

export const proxyHandler: Middleware = async <T extends AlistServer & WebdavServer>(ctx: ParameterizedContext<ProxiedState<T>>) => {
  const { state, req: request, res: response } = ctx

  const { headers } = request
  // 要定位请求文件的位置 bytes=98304-
  const range = headers.range
  const start = range ? Number(range.replace('bytes=', '').split('-')[0]) : 0
  // 检查路径是否满足加密要求，要拦截的路径可能有中文
  const { passwdInfo } = pathFindPasswd(state.serverConfig.passwdList, decodeURIComponent(request.url))

  logger.info('匹配密码信息', passwdInfo === null ? '无密码' : passwdInfo.password)

  let encryptTransform: Transform, decryptTransform: Transform
  // fix webdav move file
  if (request.method.toLocaleUpperCase() === 'MOVE' && headers.destination) {
    let destination = flat(headers.destination)
    destination = state.serverAddr + destination.substring(destination.indexOf(path.dirname(request.url)), destination.length)
    request.headers.destination = destination
  }

  // 如果是上传文件，那么进行流加密，目前只支持webdav上传，如果alist页面有上传功能，那么也可以兼容进来
  if (request.method.toLocaleUpperCase() === 'PUT' && passwdInfo) {
    // 兼容macos的webdav客户端x-expected-entity-length
    ctx.state.fileSize = Number(headers['content-length'] || flat(headers['x-expected-entity-length']) || 0)
    // 需要知道文件长度，等于0 说明不用加密，这个来自webdav奇怪的请求
    if (ctx.state.fileSize !== 0) {
      encryptTransform = new FlowEnc(passwdInfo.password, passwdInfo.encType, ctx.state.fileSize).encryptTransform()
    }
  }

  // 如果是下载文件，那么就进行判断是否解密
  if ('GET,HEAD,POST'.includes(request.method.toLocaleUpperCase()) && passwdInfo) {
    // 根据文件路径来获取文件的大小
    let filePath = ctx.req.url.split('?')[0]
    // 如果是alist的话，那么必然有这个文件的size缓存（进过list就会被缓存起来）
    state.fileSize = 0
    // 这里需要处理掉/p 路径
    if (filePath.indexOf('/p/') === 0) {
      filePath = filePath.replace('/p/', '/')
    }
    if (filePath.indexOf('/d/') === 0) {
      filePath = filePath.replace('/d/', '/')
    }
    // 尝试获取文件信息，如果未找到相应的文件信息，则对文件名进行加密处理后重新尝试获取文件信息
    let fileInfo = await getFileInfo(filePath)

    if (fileInfo === null) {
      const rawFileName = decodeURIComponent(path.basename(filePath))
      const ext = path.extname(rawFileName)
      const encodedRawFileName = encodeURIComponent(rawFileName)
      const encFileName = encodeName(passwdInfo.password, passwdInfo.encType, rawFileName)
      const newFileName = encFileName + ext

      filePath = filePath.replace(encodedRawFileName, newFileName)
      state.urlAddr = state.urlAddr.replace(encodedRawFileName, newFileName)

      fileInfo = await getFileInfo(filePath)
    }

    logger.info('获取文件信息:', filePath, JSON.stringify(fileInfo))

    if (fileInfo) {
      state.fileSize = fileInfo.size
    } else if (request.headers.authorization) {
      // 这里要判断是否webdav进行请求, 这里默认就是webdav请求了
      const authorization = request.headers.authorization
      const webdavFileInfo = await getWebdavFileInfo(state.urlAddr, authorization)
      logger.info('@@webdavFileInfo:', filePath, webdavFileInfo)
      if (webdavFileInfo) {
        webdavFileInfo.path = filePath
        // 某些get请求返回的size=0，不要缓存起来
        if (webdavFileInfo.size > 0) {
          await cacheFileInfo(webdavFileInfo)
        }
        state.fileSize = webdavFileInfo.size
      }
    }

    state.passwdInfo = passwdInfo

    // logger.info('@@@@request.filePath ', request.filePath, result)
    if (state.fileSize !== 0) {
      const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, state.fileSize)
      if (start) {
        await flowEnc.setPosition(start)
      }
      decryptTransform = flowEnc.decryptTransform()
    }
  }

  await httpFlowClient({
    urlAddr: state.urlAddr,
    passwdInfo: state.passwdInfo,
    fileSize: state.fileSize,
    request,
    response,
    encryptTransform,
    decryptTransform,
  })
}
