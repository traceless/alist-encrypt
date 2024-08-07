import Router from 'koa-router'

const staticRouter = new Router({ prefix: '/index' })

staticRouter.redirect('/', '/public/index.html', 302)

export default staticRouter
