import path from 'path'

import type { Middleware } from 'koa'

import { logger } from '@/common/logger'
import { httpClient } from '@/utils/httpClient'
import { encodeName, pathFindPasswd } from '@/utils/cryptoUtil'
import { alist } from '@/@types/alist'

const origPrefix = 'orig_'

export const copyOrMoveFileMiddleware: Middleware<
  ProxiedState<AlistServer>,
  ParsedContext<alist.FsMoveRequestBody | alist.FsCopyRequestBody>
> = async (ctx) => {
  const state = ctx.state
  const { dst_dir: dstDir, src_dir: srcDir, names } = ctx.request.body
  const { passwdInfo } = pathFindPasswd(state.serverConfig.passwdList, srcDir)

  logger.info(`复制/移动文件: ${JSON.stringify(names)}`)
  logger.info(`原文件夹:${srcDir} -> 目标文件夹:${dstDir}`)

  let fileNames = []
  if (passwdInfo && passwdInfo.encName) {
    for (const name of names) {
      // is not enc name
      if (name.indexOf(origPrefix) === 0) {
        const origName = name.replace(origPrefix, '')
        fileNames.push(origName)
        break
      }
      const fileName = path.basename(name)
      // you can custom Suffix
      const ext = passwdInfo.encSuffix || path.extname(fileName)
      const encName = encodeName(passwdInfo.password, passwdInfo.encType, fileName)
      const newFileName = encName + ext
      fileNames.push(newFileName)
    }

    logger.info('转化为原始文件名: ', JSON.stringify(fileNames))
  } else {
    fileNames = Object.assign([], names)
  }

  delete ctx.req.headers['content-length']

  ctx.body = await httpClient({
    urlAddr: state.urlAddr,
    reqBody: JSON.stringify({ dst_dir: dstDir, src_dir: srcDir, names: fileNames }),
    request: ctx.req,
    response: ctx.res,
  })
}
