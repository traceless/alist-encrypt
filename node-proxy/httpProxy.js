import http from 'http'
import FlowEnc from './utils/flowEnc.js'
import https from 'node:https'
const Agent = http.Agent
const Agents = https.Agent

const flowEnc = new FlowEnc('123456')
// 连接数无所谓多少了
const maxSockets = 50
const httpsAgent = new Agents({
  maxSockets,
  maxFreeSockets: maxSockets,
  keepAlive: true
})
const httpAgent = new Agent({
  maxSockets,
  maxFreeSockets: maxSockets,
  keepAlive: true
})

const webdavServerHost = '192.168.8.240'
const webdavServerPort = 5244
let authorization = null

// http客户端请求
function httpClient(request, response, redirect = 3) {
  const { method, headers, urlAddr } = request
  console.log('request_info: ', headers, method, urlAddr)
  // 创建请求
  const options = {
    method,
    headers,
    agent: ~urlAddr.indexOf('https') ? httpsAgent : httpAgent,
    rejectUnauthorized: false
  }
  const httpRequest = ~urlAddr.indexOf('https') ? https : http
  // 处理重定向的请求，让下载的流量经过代理服务器
  const webdavReq = httpRequest.request(urlAddr, options, (webdavResp) => {
    console.log('@@statusCode', webdavResp.statusCode, webdavResp.headers)
    response.statusCode = webdavResp.statusCode
    for (const key in webdavResp.headers) {
      response.setHeader(key, webdavResp.headers[key])
    }
    if (response.statusCode === 302 || response.statusCode === 301) {
      if (redirect <= 0) {
        // 防止无限重定向, 结束重定向
        console.log('httpResp结束重定向...')
        response.end()
        return
      }
      // 重新请求一次，把流量代理进来
      request.urlAddr = webdavResp.headers.location
      delete request.headers.host
      delete request.headers.authorization
      request.method = 'GET'
      console.log('302 redirect: ', request.urlAddr)
      return httpClient(request, response, redirect - 1).end()
    }
    let resLength = 0
    webdavResp
      .on('data', (chunk) => {
        resLength += chunk.length
      })
      .on('end', () => {
        console.log('httpResp响应结束...', resLength, request.url)
      })
    // 如果要解密那么就直接pipe，这里需要判断路径，还有识别当前是下载请求 TODO
    if (~urlAddr.indexOf('https')) {
      // 可以在这里添加条件判断进行加解密 TODO
      webdavResp.pipe(flowEnc.decodeTransform()).pipe(response)
      return
    }
    // 直接透传
    webdavResp.pipe(response)
  })
  return webdavReq
}

// 创建一个 HTTP 代理服务器
const proxy = http.createServer((req, res) => {})
// 监听请求，实时处理透传数据到下游webdav
proxy.on('request', (request, response) => {
  // 缓存起来，很多客户端并不是每次都会携带 authorization，导致上传文件一些异常，不想catch了，直接每次携带 authorization
  request.headers.authorization = request.headers.authorization
    ? (authorization = request.headers.authorization)
    : authorization
  // headers 所有都透传，不删除，host需要单独修改，实测没影响
  request.headers.host = webdavServerHost + ':' + webdavServerPort
  request.urlAddr = `http://${request.headers.host}` + request.url
  // 如果是上传文件，那么进行流加密
  if (request.method.toLocaleUpperCase() === 'PUT') {
    const webdavReq = httpClient(request, response)
    // 这里就进行文件上传，可以进行加解密，一般判断路径 TODO
    request.pipe(flowEnc.encodeTransform()).pipe(webdavReq)
    return
  }
  const webdavReq = httpClient(request, response)
  request.pipe(webdavReq)
})

// 代理服务器正在运行
const port = 5344
proxy.listen(port, () => {
  console.log(' webdav proxy start ', port)
})
