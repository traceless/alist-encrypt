'use strict'

import Router from 'koa-router'
import bodyparser from 'koa-bodyparser'
import crypto from 'crypto'
import { getUserInfo, cacheUserToken, getUserByToken, updateUserInfo } from './dao/userDao.js'
import responseHandle from './middleware/responseHandle.js'

// bodyparser解析body
const bodyparserMw = bodyparser({ enableTypes: ['json', 'form', 'text'] })

// 总路径，添加所有的子路由
const allRouter = new Router()
// 拦截全部
allRouter.all(/\/enc-api\/*/, bodyparserMw, responseHandle, async (ctx, next) => {
  console.log('@@log request-url: ', ctx.req.url)
  await next()
})

// 白名单路由
allRouter.all('/enc-api/login', async (ctx, next) => {
  const { username, password } = ctx.request.body
  console.log(username, password)
  const userInfo = await getUserInfo(username)
  console.log(userInfo)
  if (userInfo && password === userInfo.password) {
    // 创建token
    const token = crypto.randomUUID()
    // 异步执行
    cacheUserToken(token, userInfo)
    userInfo.password = null
    ctx.body = { data: { userInfo, jwtToken: token } }
    return
  }
  ctx.body = { msg: '密码不正确 ', code: 500 }
})

// 拦截登录
allRouter.all(/\/enc-api\/*/, async (ctx, next) => {
  const { authorize_token: authorizeToken } = ctx.request.headers
  // 查询数据库是否有密码
  const userInfo = await getUserByToken(authorizeToken)
  if (userInfo == null) {
    ctx.body = { code: 401, msg: '当前用户未登录' }
    return
  }
  ctx.userInfo = userInfo
  await next()
})

// 设置前缀
const router = new Router({ prefix: '/enc-api' })

// 用户信息
router.all('/getUserInfo', async (ctx, next) => {
  const userInfo = ctx.userInfo
  console.log('@@getUserInfo', userInfo)
  userInfo.password = null
  const data = {
    codes: [16, 9, 10, 11, 12, 13, 15],
    userInfo,
    menuList: [],
    roles: ['admin'],
  }
  ctx.body = { data }
})

// 更新用户信息
router.all('/updatePasswd', async (ctx, next) => {
  const userInfo = ctx.userInfo
  const { password, newpassword } = ctx.request.body
  if (password !== userInfo.password) {
    ctx.body = { msg: 'password error', code: 500 }
    return
  }
  userInfo.password = newpassword
  updateUserInfo(userInfo)
  ctx.body = { msg: 'update success' }
})

// 用这种方式代替前缀的功能，{ prefix: } 不能和正则联合使用
allRouter.use(router.routes(), router.allowedMethods())

// restRouter.all(/\/enc-api\/*/, router.routes(), restRouter.allowedMethods())
export default allRouter
