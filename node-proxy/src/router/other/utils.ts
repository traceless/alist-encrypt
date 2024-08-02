import path from 'path'

import type { Middleware } from 'koa'

import { logger } from '@/common/logger'
import { convertRealName, pathFindPasswd } from '@/utils/cryptoUtil'

export const downloadMiddleware: Middleware<ProxiedState<AlistServer>> = async (ctx, next) => {
  const state = ctx.state

  let filePath = ctx.req.url.split('?')[0]
  // 如果是alist的话，那么必然有这个文件的size缓存（进过list就会被缓存起来）
  state.fileSize = 0
  // 这里需要处理掉/p 路径
  if (filePath.indexOf('/d/') === 0) {
    filePath = filePath.replace('/d/', '/')
  }

  // 这个不需要处理
  if (filePath.indexOf('/p/') === 0) {
    filePath = filePath.replace('/p/', '/')
  }

  const { passwdInfo } = pathFindPasswd(state.serverConfig.passwdList, filePath)
  if (passwdInfo && passwdInfo.encName) {
    // reset content-length length
    delete ctx.req.headers['content-length']
    // check fileName is not enc or it is dir
    const fileName = path.basename(filePath)
    const realName = convertRealName(passwdInfo.password, passwdInfo.encType, fileName)
    logger.info(`转换为原始文件名: ${fileName} -> ${realName}`)

    ctx.req.url = path.dirname(ctx.req.url) + '/' + realName
    ctx.state.urlAddr = path.dirname(ctx.state.urlAddr) + '/' + realName
    logger.info('准备获取文件', ctx.req.url)
    await next()

    return
  }

  await next()
}
