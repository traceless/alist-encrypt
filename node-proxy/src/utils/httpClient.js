import { Readable } from 'stream'
import { randomUUID } from 'crypto'
import { IS_TJS } from '../runtime/isTjs.js'
import { hasBody, relaxTlsOnce, applyProxyResponse } from './proxyCommon.js'
import { httpProxyTjs, httpClientTjs } from './httpClient.tjs.js'
import { logger } from './../common/logger.js'

// node 版 HTTP 出站实现（原生流）；tjs 版见 httpClient.tjs.js，双端公共段见 proxyCommon.js。
// ESM 静态图无法按运行时条件 re-export，分发点即下列两行 if (IS_TJS)。

export async function httpProxy(request, response, encryptTransform, decryptTransform) {
  if (IS_TJS) return httpProxyTjs(request, response, encryptTransform, decryptTransform)
  const { method, headers, urlAddr, passwdInfo, url, fileSize } = request
  const reqId = randomUUID().substring(30)
  logger.debug('@@request_proxy: ', reqId, method, urlAddr, headers, !!encryptTransform, !!decryptTransform)
  relaxTlsOnce(urlAddr)

  // 本地连接关闭时中断上游请求（等价原版 httpReq.destroy()）
  const ac = new AbortController()
  response.on('close', () => {
    logger.debug('@本地响应关闭...', reqId, url)
    ac.abort()
  })

  // 加密上传：请求体经 transform 流后转 web stream；fetch 要求流式 body 必须声明 duplex
  const bodySource = encryptTransform ? request.pipe(encryptTransform) : request
  const body = hasBody(method) ? Readable.toWeb(bodySource) : undefined

  let httpResp
  try {
    httpResp = await fetch(urlAddr, {
      method,
      headers,
      body,
      duplex: body ? 'half' : undefined,
      redirect: 'manual', // 重定向必须由本代理改写 Location 后透传，不能跟随
      signal: ac.signal,
    })
  } catch (err) {
    // 原版 httpReq error 仅记日志（Promise 悬挂、客户端挂到超时）；这里快速结束响应
    logger.error('@@httpProxy request error ', reqId, err, urlAddr, headers)
    response.end()
    return
  }

  await applyProxyResponse(response, httpResp, { method, passwdInfo, url, fileSize, decryptTransform, reqId })

  if (!httpResp.body) {
    // 204/304 等无 body 响应
    response.end()
    return
  }
  const upstream = Readable.fromWeb(httpResp.body)
  upstream.on('close', () => {
    logger.info('@远程响应关闭...', method, reqId, urlAddr)
    // 这里好像会好一些，主动完成响应
    if (decryptTransform) decryptTransform.destroy()
  })
  // 是否需要解密（pipe 结束时自动 end 响应，等价原版手动 response.end()）
  decryptTransform ? upstream.pipe(decryptTransform).pipe(response) : upstream.pipe(response)
}

export async function httpClient(request, response) {
  if (IS_TJS) return httpClientTjs(request, response)
  // urlAddr 包含http
  const { method, headers, urlAddr, reqBody, url } = request
  // 请求reqBody已被篡改，由调用者调整length或删除，不然影响webdav
  logger.debug('@@request_client: ', method, urlAddr, headers, reqBody)
  relaxTlsOnce(urlAddr)

  // reqBody 优先（string/JSON 序列化），否则透传原始请求流（如 PROPFIND）
  let body
  if (hasBody(method)) {
    if (reqBody) {
      body = typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody)
    } else if (url) {
      body = Readable.toWeb(request)
    }
    // 都没有时 body: undefined，等价原版 httpReq.end() 空请求
  }

  let httpResp
  try {
    httpResp = await fetch(urlAddr, {
      method,
      headers,
      body,
      duplex: body instanceof ReadableStream ? 'half' : undefined,
      redirect: 'manual', // 原版 node:http 不自动跟随重定向
    })
  } catch (err) {
    // 原版 error 仅记日志且 Promise 悬挂；这里返回空串让上层按空响应处理
    logger.error('@@httpClient request error ', err, urlAddr)
    return ''
  }

  if (response) {
    // 外部的ctx.body=OK会导致statusCode=200，外部方法要执行ctx.status = ctx.res.statusCode
    response.statusCode = httpResp.status
    for (const [key, value] of httpResp.headers) {
      response.setHeader(key, value)
    }
    // 不能用 response.writeHead(statusCode, res.header)
    // 会导致直接响应了Content-length: 123, 外部修改的body长度变化后就没法使用，而且外部需要要用ctx.body
    // 因为ctx.body 会重新计算响应的Content-length
  }

  const result = await httpResp.text()
  logger.info('httpClient响应结束.', method, result.length, url)
  return result
}
