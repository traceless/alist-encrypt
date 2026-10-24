'use strict'

// 等价 koa-bodyparser({ enableTypes: ['json', 'form', 'text'] }) 的精简实现
// 解析结果通过 c.get('requestBody') 获取，等价 koa 的 ctx.request.body
export default async function bodyParser(c, next) {
  const type = (c.req.header('content-type') || '').split(';')[0].trim()
  try {
    if (type === 'application/json') {
      c.set('requestBody', await c.req.json())
    } else if (type === 'application/x-www-form-urlencoded') {
      c.set('requestBody', await c.req.parseBody())
    } else if (type === 'text/plain') {
      c.set('requestBody', await c.req.text())
    } else {
      c.set('requestBody', {})
    }
  } catch (err) {
    // 与 koa-bodyparser 行为一致：body 解析失败按 400 抛出，由 globalHandle 统一兜底
    err.status = 400
    throw err
  }
  await next()
}
