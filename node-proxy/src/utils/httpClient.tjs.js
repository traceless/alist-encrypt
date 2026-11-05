/**
 * tjs 版 HTTP 出站实现（Web 流，P2/P3）：与 httpClient.js 的 node 版业务语义逐段对齐
 * （公共业务段在 proxyCommon.js），差异收敛在流处理层——
 *   - 请求体：incoming shim 的 body 即 Web ReadableStream；加密上传经
 *     body.pipeThrough(encryptTransform)（等价 node 的 request.pipe(encryptTransform)，
 *     transform 为 Web TransformStream 形态，由 flowEnc 按运行时返回）
 *   - 响应体：后台泵（不 await，与 node pipe 的异步语义一致）写入 outgoing shim，
 *     背压经 await response.write() → TransformStream 高水位 → 上游 fetch body 传递，
 *     最终由 tjs httpserver 读 _readable 输出，避免大文件内存堆积；
 *     解密经 httpResp.body.pipeThrough(decryptTransform)（等价 node 的
 *     upstream.pipe(decryptTransform).pipe(response)，302 响应同样挂解密流）
 *
 * node 端也会加载本文件顶层（httpClient.js 的分发 import）：
 * 顶层仅 Web 标准 API 与纯函数，无 tjs 全局引用，node-safe。
 */
import { randomUUID } from 'crypto'
import { logger } from './../common/logger.js'
import { hasBody, relaxTlsOnce, applyProxyResponse } from './proxyCommon.js'

export async function httpProxyTjs(request, response, encryptTransform, decryptTransform) {
  const { method, headers, urlAddr, passwdInfo, url, fileSize } = request
  const reqId = randomUUID().substring(30)
  logger.debug('@@request_proxy: ', reqId, method, urlAddr, headers, !!encryptTransform, !!decryptTransform)
  relaxTlsOnce(urlAddr)

  // 本地连接关闭时中断上游请求（等价原版 httpReq.destroy()；tjs 下 close 由泵失败路径触发）
  const ac = new AbortController()
  response.on('close', () => {
    logger.debug('@本地响应关闭...', reqId, url)
    ac.abort()
  })

  let body = hasBody(method) ? request.body : undefined
  if (body && encryptTransform) {
    // 加密上传（P3）：请求体经加密 TransformStream（等价 node 的 request.pipe(encryptTransform)）
    body = request.body.pipeThrough(encryptTransform)
  }
  if (body) {
    // tjs fetch client（lws）对「显式 content-length 头 + body」的组合会发出畸形请求
    // （实测上游 node http 解析失败直接回 400）；剥离后由 lws client 自动计算。
    // 流式 body 必须显式声明 chunked，否则 lws 缓冲整个 body 计算长度（大文件内存不可控）
    delete headers['content-length']
    headers['transfer-encoding'] = 'chunked'
  }

  let httpResp
  try {
    httpResp = await fetch(urlAddr, {
      method,
      headers,
      body: body ?? undefined,
      duplex: body ? 'half' : undefined,
      redirect: 'manual', // 重定向必须由本代理改写 Location 后透传，不能跟随
      signal: ac.signal,
    })
  } catch (err) {
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
  // 后台泵：上游 → outgoing（不 await，与 node pipe 异步语义一致）
  // 解密下载（P3）：挂解密 TransformStream（等价 node 的 upstream.pipe(decryptTransform).pipe(response)）
  pumpToResponse(decryptTransform ? httpResp.body.pipeThrough(decryptTransform) : httpResp.body, response, reqId)
}

export async function httpClientTjs(request, response) {
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
      body = request.body // tjs 下即 Web ReadableStream（等价 node 的 Readable.toWeb）
    }
    if (body) {
      // 同 httpProxyTjs：显式 content-length 头 + body 会让 tjs fetch client 发出畸形请求，
      // 剥离后由 lws client 自动计算；流式 body 需显式 chunked 保证真流式
      delete headers['content-length']
      if (body instanceof ReadableStream) headers['transfer-encoding'] = 'chunked'
    }
    // 都没有时 body: undefined，等价原版 httpReq.end() 空请求
  }

  let httpResp
  try {
    httpResp = await fetch(urlAddr, {
      method,
      headers,
      body: body ?? undefined,
      duplex: body instanceof ReadableStream ? 'half' : undefined,
      redirect: 'manual', // 原版 node:http 不自动跟随重定向
    })
  } catch (err) {
    logger.error('@@httpClient request error ', err, urlAddr)
    return ''
  }

  if (response) {
    response.statusCode = httpResp.status
    for (const [key, value] of httpResp.headers) {
      response.setHeader(key, value)
    }
  }

  const result = await httpResp.text()
  logger.info('httpClient响应结束.', method, result.length, url)
  return result
}

async function pumpToResponse(stream, response, reqId) {
  const reader = stream.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      await response.write(value)
    }
  } catch (e) {
    // 客户端断开/上游中断：结束响应并触发 close（httpProxy 的 ac.abort 依赖此回调）
    logger.debug('@@pump error', reqId, e?.message)
    response._emitClose?.()
  }
  response.end()
}
