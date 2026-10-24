'use strict'

// 全局异常兜底，等价 koa 版本的 globalHandle
// 注意：Hono 的 compose 内建 onError（默认 500 响应），中间件 try-catch 收不到 handler 的 throw，
// 必须通过 app.onError 注册才能接管异常（koa-compose 无 onError，异常自然冒泡，二者机制不同）
export default function onErrorHandler(err, c) {
  const env = 'dev'
  const status = err.status || 500
  // 生产环境时 500 错误的详细错误内容不返回给客户端，因为可能包含敏感信息
  const error = status === 500 && env === 'prod' ? 'Internal Server Error' : err.message
  console.error('@@err', err)
  return c.json(
    {
      success: false,
      message: error,
      code: status, // 服务端自身的处理逻辑错误(包含框架错误500 及 自定义业务逻辑错误533开始 ) 客户端请求参数导致的错误(4xx开始)，设置不同的状态码
      data: null,
    },
    200
  )
}
