'use strict'

import Router from 'koa-router'
import bodyparser from 'koa-bodyparser'
import crypto from 'crypto'
import fs from 'fs'
import { encodeName, decodeName } from './utils/commonUtil.js'

// bodyparser解析body
const bodyparserMw = bodyparser({ enableTypes: ['json', 'form', 'text'] })

const encNameRouter = new Router()

// 拦截全部
encNameRouter.all('/api/fs/list', async (ctx, next) => {
  console.log('@@log request-url: ', ctx.req.url)
  await next()
  // ctx.body
})

// restRouter.all(/\/enc-api\/*/, router.routes(), restRouter.allowedMethods())
export default encNameRouter
