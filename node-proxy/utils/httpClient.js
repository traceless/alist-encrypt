import http from 'http'
import https from 'node:https'
import crypto from 'crypto'
import levelDB from './levelDB.js'
// import { pathExec } from './commonUtil.js'
const Agent = http.Agent
const Agents = https.Agent

// 默认maxFreeSockets=256
const httpsAgent = new Agents({ keepAlive: true })
const httpAgent = new Agent({ keepAlive: true })

export async function httpProxy(request, response, encryptTransform, decryptTransform) {
  const { method, headers, urlAddr, webdavConfig } = request
  console.log('@@request_info: ', method, urlAddr, headers)
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
      response.statusCode = httpResp.statusCode
      if (response.statusCode % 300 < 5) {
        // 可能出现304，redirectUrl = undefined
        const redirectUrl = httpResp.headers.location || '-'
        // 跳转到本地服务进行重定向下载 ，简单判断是否https那说明是请求云盘资源，后续完善其他业务判断条件 TODO
        const decode = ~redirectUrl.indexOf('https')
        // 因为天翼云会多次302，所以这里要保持，跳转后的路径保持跟上次一致，经过本服务器代理就可以解密
        if (decode && decryptTransform) {
          const key = crypto.randomUUID()
          await levelDB.putValue(key, { redirectUrl, webdavConfig }, 60 * 60 * 72) // 缓存起来，默认3天，足够下载和观看了
          // 、Referer
          httpResp.headers.location = `/redirect/${key}?decode=${decode}&lastUrl=${encodeURIComponent(request.url)}`
        }
        console.log('302 redirectUrl:', redirectUrl)
      }
      // 设置headers
      for (const key in httpResp.headers) {
        response.setHeader(key, httpResp.headers[key])
      }
      let resLength = 0
      httpResp
        .on('data', (chunk) => {
          resLength += chunk.length
        })
        .on('end', () => {
          resolve(resLength)
          console.log('httpResp响应结束...', resLength, request.url)
        })
      // 是否需要解密
      decryptTransform ? httpResp.pipe(decryptTransform).pipe(response) : httpResp.pipe(response)
    })
    // 是否需要加密
    encryptTransform ? request.pipe(encryptTransform).pipe(httpReq) : request.pipe(httpReq)
  })
}

export async function httpClient(request, response, encryptTransform, decryptTransform) {
  const { method, headers, urlAddr, reqBody } = request
  console.log('@@request_info-client: ', method, urlAddr, headers)
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
      response.statusCode = httpResp.statusCode
      // 设置headers
      for (const key in httpResp.headers) {
        response.setHeader(key, httpResp.headers[key])
      }
      let result = ''
      httpResp
        .on('data', (chunk) => {
          result += chunk
        })
        .on('end', () => {
          resolve(result)
          console.log('httpResp响应结束...', result, request.url)
        })
    })
    // 是否需要加密
    httpReq.write(reqBody)
    httpReq.end()
  })
}
