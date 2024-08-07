import path from 'path'
import crypto from 'crypto'
import type { Transform } from 'stream'

import Router from 'koa-router'

import nedb from '@/dao/levelDB'
import FlowEnc from '@/utils/flowEnc'
import { logger } from '@/common/logger'
import { preProxy } from '@/utils/common'
import { alistServer } from '@/config'
import { copyOrMoveFileMiddleware } from '@/router/alist/utils'
import { cacheFileInfo, getFileInfo } from '@/dao/fileDao'
import { httpClient, httpFlowClient } from '@/utils/httpClient'
import { bodyParserMiddleware, emptyMiddleware } from '@/middleware/common'
import { convertRealName, convertShowName, encodeName, pathFindPasswd } from '@/utils/cryptoUtil'
import type { alist } from '@/@types/alist'

const alistRouter = new Router<EmptyObj>({ prefix: '/api' })
// 其他的代理request预处理，添加到ctx.state中
alistRouter.use(preProxy(alistServer, false))

alistRouter.all<ProxiedState<AlistServer>, ParsedContext<alist.FsListRequestBody>>('/fs/list', bodyParserMiddleware, async (ctx, next) => {
  logger.info('从alist获取文件列表 ', ctx.req.url)

  await next()
  const { path } = ctx.request.body

  const response = JSON.parse(ctx.response.body) as alist.FsListResponseBody

  logger.info(`已从alist获取文件列表，路径:${path} 文件数量:${response.data.content?.length || 0}`)
  logger.trace(`原始文件信息: `, response.data)

  if (response.code !== 200) return

  const files = response.data.content
  if (!files) return

  const state = ctx.state
  let encrypted = false

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    file.path = path + '/' + file.name
    await cacheFileInfo(file)

    if (file.is_dir) continue

    const { passwdInfo } = pathFindPasswd(state.serverConfig.passwdList, decodeURI(file.path))

    if (passwdInfo && passwdInfo.encName) {
      encrypted = true
      file.name = convertShowName(passwdInfo.password, passwdInfo.encType, file.name)
    }
  }

  logger.info(encrypted ? '解密完成' : '无需解密内容，跳过解密')

  const coverNameMap = {} //根据不含后缀的视频文件名找到对应的含后缀的封面文件名
  const omitNames = [] //用于隐藏封面文件

  files
    .filter((fileInfo) => fileInfo.type === 5)
    .forEach((fileInfo) => {
      coverNameMap[fileInfo.name.split('.')[0]] = fileInfo.name
    })

  files
    .filter((fileInfo) => fileInfo.type === 2)
    .forEach((fileInfo) => {
      const coverName = coverNameMap[fileInfo.name.split('.')[0]]

      if (coverName) {
        omitNames.push(coverName)
        fileInfo.thumb = `/d${path}/${coverName}`
      }
    })

  //不展示封面文件，也许可以添加个配置让用户选择是否展示封面源文件
  response.data.content = files.filter((fileInfo) => !omitNames.includes(fileInfo.name))
  ctx.body = response

  logger.info(`返回文件列表信息`)
  logger.trace(`处理后文件信息: `, ctx.body.data)
})

alistRouter.all<ProxiedState<AlistServer>, ParsedContext<alist.FsGetRequestBody>>('/fs/get', bodyParserMiddleware, async (ctx, next) => {
  const { path: filePath } = ctx.request.body
  const state = ctx.state
  const { passwdInfo } = pathFindPasswd(state.serverConfig.passwdList, filePath)

  const encrypted = passwdInfo && passwdInfo.encName

  logger.info(`文件路径: ${filePath} 是否被加密 ${Boolean(encrypted)}`)

  if (encrypted) {
    // reset content-length length
    delete ctx.req.headers['content-length']
    // check fileName is not enc
    const fileName = path.basename(filePath)
    const fileInfo = await getFileInfo(encodeURIComponent(filePath))
    //  Check if it is a directory
    if (fileInfo && fileInfo.is_dir) {
      await next()
      return
    }

    const realName = convertRealName(passwdInfo.password, passwdInfo.encType, fileName)
    const fileUri = path.dirname(filePath) + '/' + realName
    logger.info(`构造原始路径: ${filePath} -> ${fileUri}`)
    ctx.request.body.path = fileUri
  }

  logger.info('获取文件内容...')

  await next()

  ctx.body = JSON.parse(ctx.body)

  logger.info(encrypted ? '开始解密文件信息' : '文件未加密，跳过解密')

  if (encrypted) {
    // return showName
    const respBody = ctx.body
    respBody.data.name = convertShowName(passwdInfo.password, passwdInfo.encType, respBody.data.name)

    const { headers } = ctx.request
    const key = crypto.randomUUID()

    await nedb.setExpire(
      key,
      {
        redirectUrl: respBody.data.raw_url,
        passwdInfo,
        fileSize: respBody.data.size,
      },
      60 * 60 * 72
    ) // 缓存起来，默认3天，足够下载和观看了

    respBody.data.raw_url = `${
      headers.origin || (headers['x-forwarded-proto'] || ctx.protocol) + '://' + ctx.state.selfHost
    }/redirect/${key}?decode=1&lastUrl=${encodeURIComponent(ctx.request.body.path)}`

    if (respBody.data.provider === 'AliyundriveOpen') respBody.data.provider = 'Local'

    ctx.body = respBody
  }

  logger.info(`返回文件信息`)
})

// 处理网页上传文件
alistRouter.put<ProxiedState<AlistServer>, EmptyObj>('/fs/put', emptyMiddleware, async (ctx) => {
  const { headers } = ctx.request
  const state = ctx.state
  const uploadPath = headers['file-path'] ? decodeURIComponent(headers['file-path'] as string) : '/-'
  const { passwdInfo } = pathFindPasswd(state.serverConfig.passwdList, uploadPath)

  const encrypted = passwdInfo && passwdInfo.encName
  logger.info(`上传文件: ${uploadPath} 加密${Boolean(encrypted)}`)

  let encryptTransform: Transform
  if (encrypted) {
    const fileName = path.basename(uploadPath)
    const ext = passwdInfo.encSuffix || path.extname(fileName)
    const encName = encodeName(passwdInfo.password, passwdInfo.encType, fileName)
    const filePath = path.dirname(uploadPath) + '/' + encName + ext
    logger.info('加密后路径: ', filePath)
    headers['file-path'] = encodeURIComponent(filePath)
    const flowEnc = new FlowEnc(passwdInfo.password, passwdInfo.encType, ctx.state.fileSize)
    encryptTransform = flowEnc.encryptTransform()
  }

  return await httpFlowClient({
    urlAddr: state.urlAddr,
    passwdInfo,
    fileSize: state.fileSize,
    request: ctx.req,
    response: ctx.res,
    encryptTransform,
  })
})

alistRouter.all<ProxiedState<AlistServer>, ParsedContext<alist.FsRenameRequestBody>>('/fs/rename', bodyParserMiddleware, async (ctx) => {
  const { path: filePath, name } = ctx.request.body
  const { serverConfig: config, urlAddr } = ctx.state
  const { passwdInfo } = pathFindPasswd(config.passwdList, filePath)

  const reqBody: alist.FsRenameRequestBody = { path: filePath, name }

  logger.info(`重命名文件 ${filePath} -> ${name}`)

  // reset content-length length
  delete ctx.req.headers['content-length']

  let fileInfo = await getFileInfo(encodeURIComponent(filePath))

  if (fileInfo == null && passwdInfo && passwdInfo.encName) {
    // maybe a file
    const realName = convertRealName(passwdInfo.password, passwdInfo.encType, filePath)
    const realFilePath = path.dirname(filePath) + '/' + realName
    logger.info(`转化为原始文件路径: ${filePath} ${realFilePath}`)
    fileInfo = await getFileInfo(encodeURIComponent(realFilePath))
  }

  if (passwdInfo && passwdInfo.encName && fileInfo && !fileInfo.is_dir) {
    // reset content-length length
    const ext = passwdInfo.encSuffix || path.extname(name)
    const realName = convertRealName(passwdInfo.password, passwdInfo.encType, filePath)
    const fileUri = path.dirname(filePath) + '/' + realName
    const newName = encodeName(passwdInfo.password, passwdInfo.encType, name)
    reqBody.path = fileUri
    reqBody.name = newName + ext
  }

  logger.info(`重命名: ${reqBody.path} -> ${reqBody.name}`)
  ctx.body = await httpClient({
    urlAddr,
    reqBody: JSON.stringify(reqBody),
    request: ctx.req,
    response: ctx.res,
  })
})

// remove
alistRouter.all<ProxiedState<AlistServer>, ParsedContext<alist.FsRemoveRequestBody>>('/fs/remove', bodyParserMiddleware, async (ctx) => {
  const { dir, names } = ctx.request.body
  const state = ctx.state

  logger.info(`删除文件: 路径${dir} 文件名${JSON.stringify(names)}`)

  const { passwdInfo } = pathFindPasswd(state.serverConfig.passwdList, dir)

  // maybe a folder，remove anyway the name
  const fileNames = Object.assign([], names) //TODO 并没有判断是否加密，而是尝试同时删除加密前与加密后的文件，应该修改为判断是否加密再删除
  if (passwdInfo && passwdInfo.encName) {
    for (const name of names) {
      // is not enc name
      const realName = convertRealName(passwdInfo.password, passwdInfo.encType, name)
      fileNames.push(realName)
    }

    logger.info('转化为原始文件名: ', JSON.stringify(fileNames))
  }

  const reqBody = { dir, names: fileNames }

  // reset content-length length
  delete ctx.req.headers['content-length']

  ctx.body = await httpClient({
    urlAddr: state.urlAddr,
    reqBody: JSON.stringify(reqBody),
    request: ctx.req,
    response: ctx.res,
  })
})

alistRouter.all<ProxiedState<AlistServer>, ParsedContext<alist.FsMoveRequestBody>>('/fs/move', bodyParserMiddleware, copyOrMoveFileMiddleware)

alistRouter.all<ProxiedState<AlistServer>, ParsedContext<alist.FsCopyRequestBody>>('/fs/copy', bodyParserMiddleware, copyOrMoveFileMiddleware)

export default alistRouter
