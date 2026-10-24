'use strict'

// 统一响应包装，等价 koa 版本的 responseHandle
export default async function responseHandle(c, next) {
  const env = 'dev'
  try {
    await next()
    // 404 统一转换为业务响应（等价原 ctx.throw(404, '请求资源未找到!')）
    if (c.res.status === 404) {
      const notFound = new Error('请求资源未找到!')
      notFound.status = 404
      throw notFound
    }
    // 等价原 typeof ctx.body === 'object' 判断：只包装 JSON 响应
    const contentType = c.res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      let body
      try {
        body = await c.res.json()
      } catch {
        return
      }
      if (body && typeof body === 'object') {
        const { msg, code, data } = body
        // 注意：Hono 在 finalized 之后 return 的 Response 不会覆盖 c.res，必须显式赋值
        c.res = c.json({ flag: true, msg, code: code || 200, data })
      }
    }
  } catch (err) {
    // 所有的异常都在 app 上触发一个 error 事件，框架会记录一条错误日志
    console.log(err)
    const status = err.status || 500
    // 生产环境时 500 错误的详细错误内容不返回给客户端，因为可能包含敏感信息
    const error = status === 500 && env === 'prod' ? 'Internal Server Error' : err.message
    // 从 error 对象上读出各个属性，设置到响应中
    c.res = c.json(
      {
        flag: false,
        msg: error,
        code: status, // 服务端自身的处理逻辑错误(包含框架错误500 及 自定义业务逻辑错误533开始 ) 客户端请求参数导致的错误(4xx开始)，设置不同的状态码
        data: null,
      },
      200
    )
  }
}
