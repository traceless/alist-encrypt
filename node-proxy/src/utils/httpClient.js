import http from 'http'
import https from 'node:https'
import crypto, { randomUUID } from 'crypto'
import levelDB from './levelDB.js'
import path from 'path'
import { decodeName } from './commonUtil.js'
// import { pathExec } from './commonUtil.js'
const Agent = http.Agent
const Agents = https.Agent

// 默认maxFreeSockets=256
const httpsAgent = new Agents({ keepAlive: true })
const httpAgent = new Agent({ keepAlive: true })

export async function httpProxy(request, response, encryptTransform, decryptTransform) {
  const { method, headers, urlAddr, passwdInfo } = request
  const reqId = randomUUID()
  console.log('@@request_info: ', reqId, method, urlAddr, headers, !!encryptTransform, !!decryptTransform)
  // 创建请求
  const options = {
    method,
    headers,
    agent: ~urlAddr.indexOf('https') ? httpsAgent : httpAgent,
    rejectUnauthorized: false,
  }
  const httpRequest = ~urlAddr.indexOf('https') ? https : http
  return new Promise((resolve, reject) => {
    // 处理重定向的请求，让下载的流量经过代理服务器
    const httpReq = httpRequest.request(urlAddr, options, async (httpResp) => {
      console.log('@@statusCode', reqId, httpResp.statusCode, httpResp.headers)
      response.statusCode = httpResp.statusCode
      if (response.statusCode % 300 < 5) {
        // 可能出现304，redirectUrl = undefined
        const redirectUrl = httpResp.headers.location || '-'
        // 百度云盘不是https，坑爹，因为天翼云会多次302，所以这里要保持，跳转后的路径保持跟上次一致，经过本服务器代理就可以解密
        if (decryptTransform && passwdInfo.enable) {
          const key = crypto.randomUUID()
          console.log()
          await levelDB.setExpire(key, { redirectUrl, passwdInfo, fileSize: request.fileSize }, 60 * 60 * 72) // 缓存起来，默认3天，足够下载和观看了
          // 、Referer
          httpResp.headers.location = `/redirect/${key}?decode=1&lastUrl=${encodeURIComponent(request.url)}`
        }
        console.log('302 redirectUrl:', redirectUrl)
      } else if (httpResp.headers['content-range'] && httpResp.statusCode === 200) {
        response.statusCode = 206
      }
      // 设置headers
      for (const key in httpResp.headers) {
        response.setHeader(key, httpResp.headers[key])
      }
      // 下载时解密文件名
      if (response.statusCode === 200 && passwdInfo.enable && passwdInfo.encName) {
        let cd = response.getHeader('content-disposition')
        cd = cd ? cd.replace(/filename\*?=[^=;]*;?/g, '') : ''
        let fileName = decodeURIComponent(path.basename(request.url))
        const ext = path.extname(fileName)
        fileName = decodeName(passwdInfo.password, passwdInfo.encType, fileName.replace(ext, ''))
        response.setHeader('content-disposition', cd + `filename*=UTF-8''${encodeURIComponent(fileName)};`)
      }
      let resLength = 0
      const dataStr = ''
      httpResp
        .on('data', (chunk) => {
          resLength += chunk.length
          // dataStr += chunk
        })
        .on('end', () => {
          resolve(resLength)
          console.log('httpResp响应结束...', resLength, dataStr, request.url)
        })
      // 是否需要解密
      decryptTransform ? httpResp.pipe(decryptTransform).pipe(response) : httpResp.pipe(response)
      // 修复阿里云连接中断的问题
      httpResp.on('close', () => {
        response.destroy()
        if (decryptTransform) {
          decryptTransform.destroy()
        }
      })
    })
    httpReq.on('error', (err) => {
      console.log('@@httpProxy request error ', err, urlAddr, headers)
    })
    // 是否需要加密
    encryptTransform ? request.pipe(encryptTransform).pipe(httpReq) : request.pipe(httpReq)
  })
}

export async function httpClient(request, response) {
  const { method, headers, urlAddr, reqBody } = request
  console.log('@@request_client: ', method, urlAddr, headers)
  // 创建请求
  const options = {
    method,
    headers,
    agent: ~urlAddr.indexOf('https') ? httpsAgent : httpAgent,
    rejectUnauthorized: false,
  }
  const httpRequest = ~urlAddr.indexOf('https') ? https : http
  return new Promise((resolve, reject) => {
    // 处理重定向的请求，让下载的流量经过代理服务器
    const httpReq = httpRequest.request(urlAddr, options, async (httpResp) => {
      console.log('@@statusCode', httpResp.statusCode, httpResp.headers)
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
          console.log('httpResp响应结束...', request.url)
        })
    })
    httpReq.on('error', (err) => {
      console.log('@@httpClient request error ', err)
    })
    // check request type
    if (!reqBody) {
      request.url ? request.pipe(httpReq) : httpReq.end()
      return
    }
    // 发送请求
    typeof reqBody === 'string' ? httpReq.write(reqBody) : httpReq.write(JSON.stringify(reqBody))
    httpReq.end()
  })
}
