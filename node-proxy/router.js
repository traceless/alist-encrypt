'use strict'

import Router from 'koa-router'

const router = new Router()
const crypto = require('crypto')

// 拦截登录
router.all('/user/*', async (ctx, next) => {
  const { token, expire } = ctx.request.body
  if (token && expire > new Date().getTime()) {
    const openid = ctx.OPENID
    const md5 = crypto
      .createHash('md5')
      .update(openid + expire)
      .digest('hex')
    if (md5 === token) {
      // 把用户信息加到上下文中, 正常是通过token从redis，获取用户信息的。这里使用openid 直接查询数据库去得到
      const res = await ctx.db.collection('user').where({ openid }).get()
      let user = res.data[0]
      // 查询是否是维保员角色
      const repairmanUser = await ctx.db.collection('repairman').where({ openid }).get()
      if (repairmanUser.data.length) {
        user = Object.assign(user, repairmanUser.data[0], { role: 'repairman' })
      }
      const adminUser = await ctx.db.collection('admin').where({ openid }).get()
      if (adminUser.data.length) {
        user = Object.assign(user, adminUser.data[0], { role: 'admin' })
      }
      ctx.user = user
      await next()
      return
    }
  }
  ctx.body = { code: 1002, message: '当前用户未登录', success: false }
})

// 拦截管理员和物业的登录
router.all('/admin/*', async (ctx, next) => {
  const tokenStr = ctx.headers['x-token']
  const tokenArr = tokenStr.split('#')
  const token = tokenArr[0]
  const expire = tokenArr[1]
  const userName = tokenArr[2]
  if (token && expire > new Date().getTime()) {
    const md5 = crypto
      .createHash('md5')
      .update(userName + expire)
      .digest('hex')
    if (md5 === token) {
      let user = {}
      const adminUser = await ctx.db.collection('admin').where({ userName }).get()
      if (adminUser.data.length) {
        user = Object.assign(user, adminUser.data[0], { role: 'admin' })
      } else {
        ctx.body = { code: 403, message: '没有权限', success: false }
        return
      }
      ctx.user = user
      await next()
      return
    }
  }
  ctx.body = { code: 1002, message: '当前用户未登录', success: false }
})

router.all('/customer/*', async (ctx, next) => {
  const tokenStr = ctx.headers['x-token']
  const tokenArr = tokenStr.split('#')
  const token = tokenArr[0]
  const expire = tokenArr[1]
  const userName = tokenArr[2]
  if (token && expire > new Date().getTime()) {
    const md5 = crypto
      .createHash('md5')
      .update(userName + expire)
      .digest('hex')
    if (md5 === token) {
      let user = {}
      // 查询是否是物业
      const customer = await ctx.db.collection('customer').where({ mobile: userName }).get()
      if (customer.data.length) {
        user = Object.assign(user, customer.data[0], { role: 'customer' })
      }
      const repairman = await ctx.db.collection('repairman').where({ mobile: userName }).get()
      if (repairman.data.length) {
        user = Object.assign(user, repairman.data[0], { role: 'repairman' })
      }
      const adminUser = await ctx.db.collection('admin').where({ userName }).get()
      if (adminUser.data.length) {
        user = Object.assign(user, adminUser.data[0], { role: 'admin' })
      }
      ctx.user = user
      await next()
      return
    }
  }
  ctx.body = { code: 1002, message: '当前用户未登录', success: false }
})

export default router
