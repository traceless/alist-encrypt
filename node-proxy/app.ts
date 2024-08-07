import path from 'path'
import http from 'http'

import Koa from 'koa'
import serve from 'koa-static'

import { port } from '@/config'
import { logger } from '@/common/logger'
import alisRouter from '@/router/alist'
import otherRouter from '@/router/other'
import webdavRouter from '@/router/webdav'
import staticRouter from '@/router/static'
import webuiRouter from '@/router/webui'
import { exceptionMiddleware, loggerMiddleware } from '@/middleware/common'

const app = new Koa()

app.use(loggerMiddleware)
app.use(exceptionMiddleware)
app.use(serve(path.dirname(process.argv[1]), { root: 'public' }))
app.use(alisRouter.routes())
app.use(webuiRouter.routes())
app.use(webdavRouter.routes())
app.use(staticRouter.routes())
app.use(otherRouter.routes())

const server = http.createServer(app.callback())
server.maxConnections = 1000
server.listen(port, () => logger.info('服务启动成功: ' + port))

setInterval(() => {
  logger.debug('server_connections', server.connections, Date.now())
}, 600 * 1000)
