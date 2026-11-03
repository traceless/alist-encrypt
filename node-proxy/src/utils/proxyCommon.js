/**
 * 双端公共代理业务段（无运行时结构差异）：httpClient.js（node 实现）与
 * httpClient.tjs.js（tjs 实现）共用，抽独立文件保证两个运行时实现互不沾染。
 */
import { randomUUID } from 'crypto'
import path from 'path'
import { decodeName } from './commonUtil.js'
import { logger } from './../common/logger.js'
import levelDB from './levelDB.js'
import { IS_TJS } from '../runtime/isTjs.js'

// fetch 规范禁止 GET/HEAD 携带 body（原版 node:http 无此限制，空流透传无害）
export function hasBody(method) {
  return !/^(GET|HEAD)$/i.test(method)
}

// 代理必须接受任意上游证书（原版 node:http 为 per-request rejectUnauthorized:false）。
// Node 内置 fetch 无 per-request 证书选项（自定义 dispatcher 需引入 undici 包），
// 而本进程出站 https 只有上游代理请求，进程级放开语义等价；仅在首次遇到 https 上游时设置。
// tjs：fetch 无 per-request 放开选项，自签上游需通过 TJS_CA_BUNDLE/SSL_CERT_FILE 提供 CA bundle。
let tlsRelaxed = false
export function relaxTlsOnce(urlAddr) {
  if (!tlsRelaxed && urlAddr.startsWith('https')) {
    if (IS_TJS) {
      tlsRelaxed = true
      logger.warn('@https上游: tjs 无 per-request 证书放开，自签上游请配置 TJS_CA_BUNDLE/SSL_CERT_FILE')
      return
    }
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
    tlsRelaxed = true
    logger.warn('@https上游: 证书校验按原版行为放开(rejectUnauthorized:false)')
  }
}

// 上游响应落地：状态码/content-range 206/头透传/302 改写/文件名解密
export async function applyProxyResponse(response, httpResp, { method, passwdInfo, url, fileSize, decryptTransform, reqId }) {
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
    const key = randomUUID()
    await levelDB.setExpire(key, { redirectUrl, passwdInfo, fileSize }, 60 * 60 * 72) // 缓存起来，默认3天，足够下载和观看了
    response.setHeader('location', `/redirect/${key}?decode=1&lastUrl=${encodeURIComponent(url)}`)
    logger.info('302 redirectUrl:', redirectUrl)
  }
  // 下载时解密文件名
  if (method === 'GET' && response.statusCode === 200 && passwdInfo && passwdInfo.encName) {
    // 网盘URL可能带畸形百分号编码，decodeURIComponent会抛URIError，退回原始值避免中断响应
    let fileName
    try {
      fileName = decodeURIComponent(path.basename(url))
    } catch {
      fileName = path.basename(url)
    }
    fileName = decodeName(passwdInfo.password, passwdInfo.encType, fileName.replace(path.extname(fileName), ''))
    if (fileName) {
      let cd = response.getHeader('content-disposition')
      cd = cd ? cd.replace(/filename\*?=[^=;]*;?/g, '') : ''
      logger.info('@@proxy解密文件名', reqId, fileName)
      response.setHeader('content-disposition', cd + `filename*=UTF-8''${encodeURIComponent(fileName)};`)
    }
  }
}
