import path from 'path'

import serve from 'koa-static'
import Router from 'koa-router'

const staticServer = serve(path.join(path.dirname(process.argv[1]), 'public'))
const staticRouter = new Router()

staticRouter.redirect('/index', '/public/index.html', 302)

staticRouter.all('/public/(.*)', async (ctx, next) => {
  ctx.path = ctx.path.replace('/public', '')
  await staticServer(ctx, next)
})

export default staticRouter
