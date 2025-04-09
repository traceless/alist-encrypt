import path from 'path'
import type { Transform } from 'stream'

import type { Middleware, ParameterizedContext } from 'koa'

import FlowEnc from '@/utils/flowEnc'
import { logger } from '@/common/logger'
import { getFileInfo } from '@/dao/fileDao'
import { httpFlowClient } from '@/utils/httpClient'
import { convertRealName, encodeName, pathFindPasswd } from '@/utils/cryptoUtil'

export const downloadMiddleware: Middleware = async <T extends AlistServer>(ctx: ParameterizedContext<ProxiedState<T>>) => {
  const state = ctx.state
  let urlAddr = state.urlAddr
  let urlPath = new URL(urlAddr).pathname
  // 如果是alist的话，那么必然有这个文件的size缓存（进过list就会被缓存起来）
  let fileSize = 0

  // 这里需要处理掉/p 路径
  if (urlPath.indexOf('/d/') === 0) {
    urlPath = urlPath.replace('/d/', '/')
  }

  // 这个不需要处理
  if (urlPath.indexOf('/p/') === 0) {
    urlPath = urlPath.replace('/p/', '/')
  }

  // 要定位请求文件的位置 bytes=98304-
  const range = ctx.req.headers.range
  const start = range ? Number(range.replace('bytes=', '').split('-')[0]) : 0
  const { passwdInfo } = pathFindPasswd(state.serverConfig.passwdList, urlPath)

  logger.info('匹配密码信息', passwdInfo === null ? '无密码' : passwdInfo.password)

  let decryptTransform: Transform

  // 如果是下载文件，那么就进行判断是否解密
  if (passwdInfo && passwdInfo.encName) {
    delete ctx.req.headers['content-length']
    // check fileName is not enc or it is dir
    const fileName = path.basename(urlPath)
    const realName = convertRealName(passwdInfo.password, passwdInfo.encType, fileName)
    logger.info(`转换为原始文件名: ${fileName} -> ${realName}`)

    urlPath = path.dirname(urlPath) + '/' + realName
    urlAddr = path.dirname(urlAddr) + '/' + realName
    logger.info('准备获取文件', urlAddr)

    // 尝试获取文件信息，如果未找到相应的文件信息，则对文件名进行加密处理后重新尝试获取文件信息
    let fileInfo = await getFileInfo(urlPath)

    if (fileInfo === null) {
      const rawFileName = decodeURIComponent(path.basename(urlPath))
      const ext = path.extname(rawFileName)
      const encodedRawFileName = encodeURIComponent(rawFileName)
      const encFileName = encodeName(passwdInfo.password, passwdInfo.encType, rawFileName)
      const newFileName = encFileName + ext
      const newFilePath = urlPath.replace(encodedRawFileName, newFileName)

      urlAddr = urlAddr.replace(encodedRawFileName, newFileName)
      fileInfo = await getFileInfo(newFilePath)
    }

    logger.info('获取文件信息:', urlPath, JSON.stringify(fileInfo))

    if (fileInfo) fileSize = fileInfo.size

    if (fileSize !== 0) {
      const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, fileSize)
      if (start) await flowEnc.setPosition(start)
      decryptTransform = flowEnc.decryptTransform()
    }
  }

  await httpFlowClient({
    urlAddr,
    passwdInfo,
    fileSize,
    request: ctx.req,
    response: ctx.res,
    encryptTransform: undefined,
    decryptTransform,
  })
}
