'use strict'
// CLI模式: node app.js <password> <encType> <operation> <folder> <outPath> [encName]
// 服务模式: node app.js
// tjs 运行时走独立入口 app.tjs.js（本文件保持 node 专属，不被 tjs 加载）
import { convertFile } from './src/utils/convertFile.js'
import path from 'path'
import http from 'http'
import { getRequestListener } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'

import { buildApp } from './src/appFactory.js'
import { logger } from './src/common/logger.js'
import { port } from './src/config.js'

const arg = process.argv.slice(2)
if (arg.length > 1) {
  // convertFile command
  convertFile(...arg)
} else {
  // 启动代理服务
  startupServer()
}

function startupServer() {
  // compatible ncc and pkg
  const pkgDirPath = path.dirname(process.argv[1])
  const app = buildApp({ serveStatic, staticRoot: pkgDirPath })

  // 配置创建好了，就启动
  const nodeHandler = getRequestListener(app.fetch)
  const server = http.createServer(nodeHandler)
  server.maxConnections = 1000

  // 捕获带Expect:100-continue的PUT上传请求直接透传，本机不处理
  server.on('checkContinue', (req, res) => {
    // 全部交给后端的webdav服务处理，修复群晖webdav的问题
    nodeHandler(req, res)
  })

  server.listen(port, () => logger.info('服务启动成功: ' + port))
  setInterval(() => {
    // 用公开 API 替代私有属性 server._connections
    server.getConnections((err, count) => {
      if (err) {
        return logger.error('server_connections error', err)
      }
      logger.debug('server_connections', count, Date.now())
    })
  }, 600 * 1000)
}
