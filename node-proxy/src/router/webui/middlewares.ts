import type { Middleware } from 'koa'

import { flat } from '@/utils/common'
import { response } from '@/router/webui/utils'
import { getUserByToken } from '@/dao/userDao'

//获取用户信息的中间件
export const userInfoMiddleware: Middleware = async (ctx, next) => {
  // nginx不支持下划线headers
  const { authorizetoken: authorizeToken } = ctx.request.headers

  // 查询数据库是否有密码
  const userInfo = await getUserByToken(flat(authorizeToken))

  if (userInfo == null) {
    ctx.body = response({ code: 401, msg: 'user not login' })
    return
  }

  ctx.state.userInfo = userInfo //放入ctx.state，之后可以用ctx.state,userInfo获取登录信息

  await next()
}
