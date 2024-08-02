import path from 'path'
import http from 'http'
import https from 'node:https'
import { Transform } from 'stream'
import crypto, { randomUUID } from 'crypto'

import { flat } from '@/utils/common'
import levelDB from '@/dao/levelDB'
import { decodeName } from '@/utils/cryptoUtil'
import { logger } from '@/common/logger'

// 默认maxFreeSockets=256
const httpsAgent = new https.Agent({ keepAlive: true })
const httpAgent = new http.Agent({ keepAlive: true })

export async function httpClient({
  urlAddr,
  reqBody,
  request,
  response,
}: {
  urlAddr: string
  reqBody?: string
  request: http.IncomingMessage
  response?: http.ServerResponse<http.IncomingMessage>
}): Promise<string> {
  const { method, headers, url } = request
  logger.info('代理请求发起: ', method, urlAddr)
  logger.trace('http请求头: ', headers)
  // 创建请求
  const httpRequest = ~urlAddr.indexOf('https') ? https : http
  const options = {
    method,
    headers,
    agent: ~urlAddr.indexOf('https') ? httpsAgent : httpAgent,
    rejectUnauthorized: false,
  }

  return new Promise((resolve) => {
    // 处理重定向的请求，让下载的流量经过代理服务器
    const httpReq = httpRequest.request(urlAddr, options, async (httpResp) => {
      logger.info('http响应接收: 状态码', httpResp.statusCode)
      logger.trace('http响应头:', httpResp.headers)
      if (response) {
        response.statusCode = httpResp.statusCode
        for (const key in httpResp.headers) {
          response.setHeader(key, httpResp.headers[key])
        }
      }

      let result = ''
      httpResp
        .on('data', (chunk) => {
          result += chunk
        })
        .on('end', () => {
          resolve(result)
          logger.info('代理请求结束结束: ', url)
        })
    })

    httpReq.on('error', (err) => {
      logger.error('http请求出错: ', err)
    })

    // check request type
    if (!reqBody) {
      url ? request.pipe(httpReq) : httpReq.end()
      return
    }

    httpReq.write(reqBody)
    httpReq.end()
  })
}

export async function httpFlowClient({
  urlAddr,
  passwdInfo,
  fileSize,
  request,
  response,
  encryptTransform,
  decryptTransform,
}: {
  urlAddr: string
  passwdInfo: PasswdInfo
  fileSize: number
  request: http.IncomingMessage
  response?: http.ServerResponse<http.IncomingMessage>
  encryptTransform?: Transform
  decryptTransform?: Transform
}) {
  const { method, headers, url } = request
  const reqId = randomUUID()
  logger.info(`代理请求(${reqId})发起: `, method, urlAddr)
  logger.info(`httpFlow(${reqId})加解密: `, `流加密${!!encryptTransform}`, `流解密${!!decryptTransform}`)
  logger.trace(`httpFlow(${reqId})请求头: `, headers)
  // 创建请求
  const options = {
    method,
    headers,
    agent: ~urlAddr.indexOf('https') ? httpsAgent : httpAgent,
    rejectUnauthorized: false,
  }
  const httpRequest = ~urlAddr.indexOf('https') ? https : http
  return new Promise<void>((resolve) => {
    // 处理重定向的请求，让下载的流量经过代理服务器
    const httpReq = httpRequest.request(urlAddr, options, async (httpResp) => {
      logger.info(`httpFlow(${reqId})响应接收: 状态码`, httpResp.statusCode)
      logger.trace(`httpFlow(${reqId})响应头: `, httpResp.headers)
      response.statusCode = httpResp.statusCode
      if (response.statusCode % 300 < 5) {
        // 可能出现304，redirectUrl = undefined
        const redirectUrl = httpResp.headers.location || '-'
        // 百度云盘不是https，坑爹，因为天翼云会多次302，所以这里要保持，跳转后的路径保持跟上次一致，经过本服务器代理就可以解密
        if (decryptTransform && passwdInfo.enable) {
          const key = crypto.randomUUID()

          await levelDB.setExpire(key, { redirectUrl, passwdInfo, fileSize }, 60 * 60 * 72) // 缓存起来，默认3天，足够下载和观看了
          // 、Referer
          httpResp.headers.location = `/redirect/${key}?decode=1&lastUrl=${encodeURIComponent(url)}`
        }
        logger.info(`httpFlow(${reqId})重定向到:`, redirectUrl)
      } else if (httpResp.headers['content-range'] && httpResp.statusCode === 200) {
        response.statusCode = 206
      }
      // 设置headers
      for (const key in httpResp.headers) {
        response.setHeader(key, httpResp.headers[key])
      }
      // 下载时解密文件名
      if (method === 'GET' && response.statusCode === 200 && passwdInfo && passwdInfo.enable && passwdInfo.encName) {
        let fileName = decodeURIComponent(path.basename(url))
        fileName = decodeName(passwdInfo.password, passwdInfo.encType, fileName.replace(path.extname(fileName), ''))

        if (fileName) {
          let cd = response.getHeader('content-disposition')
          cd = flat(cd)
          cd = cd ? cd.toString().replace(/filename\*?=[^=;]*;?/g, '') : ''
          logger.info(`httpFlow(${reqId})解密后文件名:`, fileName)
          response.setHeader('content-disposition', cd + `filename*=UTF-8''${encodeURIComponent(fileName)};`)
        }
      }

      httpResp
        .on('end', () => {
          resolve()
        })
        .on('close', () => {
          logger.info(`代理请求(${reqId})结束:`, urlAddr)
          // response.destroy()
          if (decryptTransform) decryptTransform.destroy()
        })
      // 是否需要解密
      decryptTransform ? httpResp.pipe(decryptTransform).pipe(response) : httpResp.pipe(response)
    })
    httpReq.on('error', (err) => {
      logger.error(`httpFlow(${reqId})请求出错:`, urlAddr, err)
    })
    // 是否需要加密
    encryptTransform ? request.pipe(encryptTransform).pipe(httpReq) : request.pipe(httpReq)
    // 重定向的请求 关闭时 关闭被重定向的请求
    response.on('close', () => {
      logger.trace(`响应(${reqId})关闭: `, url)
      httpReq.destroy()
    })
  })
}
