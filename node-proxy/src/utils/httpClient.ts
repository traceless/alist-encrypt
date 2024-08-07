import path from 'path'
import http from 'http'
import https from 'node:https'
import crypto from 'crypto'
import type { Transform } from 'stream'

import { flat } from '@/utils/common'
import nedb from '@/dao/levelDB'
import { logger } from '@/common/logger'
import { decodeName } from '@/utils/cryptoUtil'

// 默认maxFreeSockets=256
const httpsAgent = new https.Agent({ keepAlive: true })
const httpAgent = new http.Agent({ keepAlive: true })

const defaultOnMessageCallback: ({
  urlAddr,
  reqBody,
  request,
  response,
  message,
}: {
  urlAddr: string
  reqBody?: string
  request: http.IncomingMessage
  response: http.ServerResponse<http.IncomingMessage>
  message: http.IncomingMessage
}) => Promise<void> = async (params) => {
  const { response, message } = params

  response.statusCode = message.statusCode

  for (const key in message.headers) {
    response.setHeader(key, message.headers[key])
  }
}

const defaultOnFlowMessageCallback: ({
  urlAddr,
  passwdInfo,
  fileSize,
  request,
  response,
  encryptTransform,
  decryptTransform,
  message,
}: {
  urlAddr: string
  passwdInfo?: PasswdInfo
  fileSize: number
  request: http.IncomingMessage
  response: http.ServerResponse<http.IncomingMessage>
  encryptTransform?: Transform
  decryptTransform?: Transform
  message: http.IncomingMessage
}) => Promise<void> = async (params) => {
  const { urlAddr, passwdInfo, fileSize, request, response, message, decryptTransform } = params

  response.statusCode = message.statusCode

  if (response.statusCode % 300 < 5) {
    // 可能出现304，redirectUrl = undefined
    const redirectUrl = message.headers.location || '-'
    // 百度云盘不是https，坑爹，因为天翼云会多次302，所以这里要保持，跳转后的路径保持跟上次一致，经过本服务器代理就可以解密
    if (decryptTransform && passwdInfo?.enable) {
      const key = crypto.randomUUID()

      await nedb.setExpire(key, { redirectUrl, passwdInfo, fileSize }, 60 * 60 * 72) // 缓存起来，默认3天，足够下载和观看了
      // 、Referer
      message.headers.location = `/redirect/${key}?decode=1&lastUrl=${encodeURIComponent(urlAddr)}`
    }
    logger.info(`httpFlow重定向到:`, redirectUrl)
  } else if (message.headers['content-range'] && message.statusCode === 200) {
    response.statusCode = 206
  }

  // 设置headers
  for (const key in message.headers) {
    response.setHeader(key, message.headers[key])
  }

  // 下载时解密文件名
  if (request.method === 'GET' && response.statusCode === 200 && passwdInfo && passwdInfo.enable && passwdInfo.encName) {
    let fileName = decodeURIComponent(path.basename(urlAddr))
    fileName = decodeName(passwdInfo.password, passwdInfo.encType, fileName.replace(path.extname(fileName), ''))

    if (fileName) {
      let disposition = flat(response.getHeader('content-disposition')).toString()
      disposition = disposition ? disposition.replace(/filename\*?=[^=;]*;?/g, '') : ''

      logger.info(`httpFlow解密后文件名:`, fileName)
      response.setHeader('content-disposition', disposition + `filename*=UTF-8''${encodeURIComponent(fileName)};`)
    }
  }
}

export async function httpClient({
  urlAddr,
  reqBody,
  request,
  response,
  onMessage = defaultOnMessageCallback,
}: {
  urlAddr: string
  reqBody?: string
  request: http.IncomingMessage
  response: http.ServerResponse<http.IncomingMessage>
  onMessage?: typeof defaultOnMessageCallback | null
}): Promise<string> {
  //如果传入ctx.res，那么当代理请求返回响应头时，ctx.res也会立即返回响应头。若不传入则当代理请求完全完成时再手动处理ctx.res
  const { method, headers } = request
  logger.info('代理http请求 发起: ', method, urlAddr)

  // 创建请求
  const options = {
    method,
    headers,
    agent: ~urlAddr.indexOf('https') ? httpsAgent : httpAgent,
    rejectUnauthorized: false,
  }

  let result = ''
  return new Promise((resolve, reject) => {
    // 处理重定向的请求，让下载的流量经过代理服务器
    const proxy = (~urlAddr.indexOf('https') ? https : http).request(urlAddr, options, async (message) => {
      logger.info(`代理http响应 接收: 状态码 ${message.statusCode}`)

      //默认的回调函数，设置response的响应码和响应头
      onMessage && (await onMessage({ urlAddr, reqBody, request, response, message }))

      message.on('data', (chunk) => {
        result += chunk
      })

      message.on('end', () => {
        resolve(result)
      })

      message.on('close', () => {
        logger.info('代理http响应 结束')
      })

      message.on('error', (err) => {
        if (err.message === 'aborted') {
          logger.warn(`代理http响应 提前终止读取`)
        } else {
          logger.error('代理http响应 获取时出错: ', err)
          reject(err)
        }
      })
    })

    proxy.on('error', (err) => {
      logger.error('代理http请求 发起时出错: ', err)
      reject(err)
    })

    proxy.on('close', () => {
      logger.info('代理http请求 结束 ')
    })

    if (!reqBody) {
      // 如果没有传入请求体，将原请求的请求体转发
      // 当ctx.request的请求体end时，proxy会自动end
      request.pipe(proxy)
    } else {
      //如果传入了请求体，将它作为转发请求的请求体
      proxy.write(reqBody)
      proxy.end()
    }
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
  onMessage = defaultOnFlowMessageCallback,
}: {
  urlAddr: string
  passwdInfo?: PasswdInfo
  fileSize: number
  request: http.IncomingMessage
  response: http.ServerResponse<http.IncomingMessage>
  encryptTransform?: Transform
  decryptTransform?: Transform
  onMessage?: typeof defaultOnFlowMessageCallback
}) {
  const { method, headers } = request

  logger.info(`代理httpFlow请求 发起: `, method, urlAddr, `流加密${!!encryptTransform}`, `流解密${!!decryptTransform}`)
  // 创建请求
  const options = {
    method,
    headers,
    agent: ~urlAddr.indexOf('https') ? httpsAgent : httpAgent,
    rejectUnauthorized: false,
  }

  return new Promise<void>((resolve, reject) => {
    const proxy = (~urlAddr.indexOf('https') ? https : http).request(urlAddr, options, async (message) => {
      logger.info(`代理httpFlow响应 接收: 状态码 ${message.statusCode}`)

      //默认的回调函数，设置response的响应码和响应头
      await onMessage({
        urlAddr,
        passwdInfo,
        fileSize,
        request,
        response,
        encryptTransform,
        decryptTransform,
        message,
      })

      message.on('end', () => {
        resolve()
      })

      message.on('close', () => {
        logger.info(`代理httpFlow响应 结束`)
        if (decryptTransform) decryptTransform.destroy()
      })

      message.on('error', (err) => {
        if (err.message === 'aborted') {
          logger.warn(`代理httpFlow响应 提前终止读取`)
        } else {
          logger.error(`代理httpFlow响应 获取时出错: `, err)
          reject(err)
        }
      })

      // 根据是否需要解密，将message的数据传递给response返回
      decryptTransform ? message.pipe(decryptTransform).pipe(response) : message.pipe(response)
    })

    proxy.on('error', (err) => {
      logger.error(`代理httpFlow请求 发起时出错: `, err)
      reject(err)
    })

    proxy.on('close', () => {
      logger.info(`代理httpFlow请求 结束`)
      if (encryptTransform) encryptTransform.destroy()
    })

    // 重定向的请求 关闭时 关闭被重定向的请求
    response.on('close', () => {
      proxy.destroy()
    })

    // 是否需要加密，将request的数据传递给proxy转发
    encryptTransform ? request.pipe(encryptTransform).pipe(proxy) : request.pipe(proxy)
  })
}
