import { Readable } from 'stream'
import crypto, { randomUUID } from 'crypto'
import levelDB from './levelDB.js'
import path from 'path'
import { decodeName } from './commonUtil.js'
import { logger } from './../common/logger.js'

// 代理必须接受任意上游证书（原版 node:http 为 per-request rejectUnauthorized:false）。
// Node 内置 fetch 无 per-request 证书选项（自定义 dispatcher 需引入 undici 包），
// 而本进程出站 https 只有上游代理请求，进程级放开语义等价；仅在首次遇到 https 上游时设置。
let tlsRelaxed = false
function relaxTlsOnce(urlAddr) {
  if (!tlsRelaxed && urlAddr.startsWith('https')) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    tlsRelaxed = true
    logger.warn('@https上游: 证书校验按原版行为放开(rejectUnauthorized:false)')
  }
}

// fetch 规范禁止 GET/HEAD 携带 body（原版 node:http 无此限制，空流透传无害）
function hasBody(method) {
  return !/^(GET|HEAD)$/i.test(method)
}

export async function httpProxy(request, response, encryptTransform, decryptTransform) {
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

  response.statusCode = httpResp.status
  const isRedirect = response.statusCode >= 300 && response.statusCode % 300 < 5
  // 3xx 且需要解密：Location 改写为本地 /redirect/:key（跳转后流量仍经过本代理才能解密）
  // 百度云盘不是https，坑爹，因为天翼云会多次302，所以这里要保持，跳转后的路径保持跟上次一致，经过本服务器代理就可以解密
  const rewriteLocation = isRedirect && decryptTransform && passwdInfo.enable
  if (httpResp.headers.has('content-range') && response.statusCode === 200) {
    response.statusCode = 206
  }
  // 透传上游响应头（undici 已剥离 transfer-encoding，不再出现 TE+CL 非法并存）；
  // location 在改写场景跳过，避免被上游原始值覆盖
  for (const [key, value] of httpResp.headers) {
    if (rewriteLocation && key === 'location') {
      continue
    }
    response.setHeader(key, value)
  }
  if (rewriteLocation) {
    const redirectUrl = httpResp.headers.get('location') || '-'
    const key = crypto.randomUUID()
    await levelDB.setExpire(key, { redirectUrl, passwdInfo, fileSize }, 60 * 60 * 72) // 缓存起来，默认3天，足够下载和观看了
    response.setHeader('location', `/redirect/${key}?decode=1&lastUrl=${encodeURIComponent(url)}`)
    logger.info('302 redirectUrl:', redirectUrl)
  }
  // 下载时解密文件名
  if (method === 'GET' && response.statusCode === 200 && passwdInfo && passwdInfo.encName) {
    let fileName = decodeURIComponent(path.basename(url))
    fileName = decodeName(passwdInfo.password, passwdInfo.encType, fileName.replace(path.extname(fileName), ''))
    if (fileName) {
      let cd = response.getHeader('content-disposition')
      cd = cd ? cd.replace(/filename\*?=[^=;]*;?/g, '') : ''
      logger.info('@@proxy解密文件名', reqId, fileName)
      response.setHeader('content-disposition', cd + `filename*=UTF-8''${encodeURIComponent(fileName)};`)
    }
  }

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
