import fs from 'fs'
import crypto from 'crypto'

import Router from 'koa-router'

import { logger } from '@/common/logger'
import { userInfoMiddleware } from '@/router/webui/middlewares'
import { encryptFile, searchFile } from '@/utils/convertFile'
import { encodeFolderName, decodeFolderName } from '@/utils/cryptoUtil'
import { emptyMiddleware, bodyParserMiddleware } from '@/middleware/common'
import { RawPasswdInfo, response, splitEncPath } from '@/router/webui/utils'
import { getUserInfo, cacheUserToken, updateUserInfo } from '@/dao/userDao'
import { alistServer, webdavServer, port, initAlistConfig, version } from '@/config'
import type { webui } from '@/@types/webui'

const webuiRouter = new Router<EmptyObj>({ prefix: '/enc-api' })
webuiRouter.use(bodyParserMiddleware) //目前webui不涉及二进制数据的响应，因此全都使用bodyParser解析request.body为对象

//登录路由
webuiRouter.all<
  EmptyObj,
  ParsedContext<{
    username: string
    password: string
  }>
>('/login', emptyMiddleware, async (ctx) => {
  const { username, password } = ctx.request.body
  const userInfo = await getUserInfo(username)
  logger.info('用户信息', JSON.stringify(userInfo))

  if (!userInfo || password !== userInfo.password) {
    ctx.body = response({ msg: 'password error', code: 500 })
    return
  }

  const token = crypto.randomUUID()
  await cacheUserToken(token, userInfo)
  userInfo.password = null
  ctx.body = response({ data: { userInfo, jwtToken: token } })
})

// 用户信息
webuiRouter.all<webui.State, ParsedContext>('/getUserInfo', userInfoMiddleware, async (ctx) => {
  const userInfo = ctx.state.userInfo
  logger.info('用户信息', JSON.stringify(userInfo))

  userInfo.password = null
  const data = {
    codes: [16, 9, 10, 11, 12, 13, 15],
    userInfo,
    menuList: [],
    roles: ['admin'],
    version,
  }
  ctx.body = response({ data })
})

// 更新用户信息
webuiRouter.all<
  webui.State,
  ParsedContext<{
    username: string
    password: string
    newpassword: string
  }>
>('/updatePasswd', userInfoMiddleware, async (ctx) => {
  const { password, newpassword, username } = ctx.request.body
  logger.info(`用户名: ${username} 原密码:${password} 新密码:${newpassword}`)

  if (newpassword.length < 7) {
    ctx.body = response({ msg: 'password too short, at less 8 digits', code: 500 })
    return
  }

  const userInfo = await getUserInfo(username)
  if (password !== userInfo.password) {
    ctx.body = response({ msg: 'password error', code: 500 })
    return
  }

  userInfo.password = newpassword
  await updateUserInfo(userInfo)
  ctx.body = response({ msg: 'update success' })

  logger.info('已更新用户信息', JSON.stringify(userInfo))
})

webuiRouter.all<webui.State, ParsedContext>('/getAlistConfig', userInfoMiddleware, async (ctx) => {
  ctx.body = response({ data: alistServer._snapshot })
})

webuiRouter.all<webui.State, ParsedContext<ModifyPropType<AlistServer, 'passwdList', RawPasswdInfo[]>>>(
  '/saveAlistConfig',
  userInfoMiddleware,
  async (ctx) => {
    let alistConfig: AlistServer = {
      ...ctx.request.body,
      passwdList: ctx.request.body.passwdList.map((p) => splitEncPath(p)),
    }

    logger.info('保存alist配置信息', JSON.stringify(alistConfig))
    const _snapshot = JSON.parse(JSON.stringify(alistConfig))
    // 写入到文件中，这里并不是真正的同步
    fs.writeFileSync(
      process.cwd() + '/conf/config.json',
      JSON.stringify(
        {
          alistServer: _snapshot,
          webdavServer,
          port,
        },
        undefined,
        '\t'
      )
    )
    alistConfig = initAlistConfig(alistConfig)
    Object.assign(alistServer, alistConfig)
    alistServer._snapshot = _snapshot
    logger.info('alist配置信息已更新')
    ctx.body = response({ msg: 'save ok' })
  }
)

//TODO 纠正拼写错误的路由 getWebdavonfig->getWebdavConfig
webuiRouter.all<webui.State, ParsedContext>('/getWebdavonfig', userInfoMiddleware, async (ctx) => {
  logger.info('获取webdav配置信息: ', JSON.stringify(webdavServer))
  ctx.body = response({ data: webdavServer })
})

webuiRouter.all<webui.State, ParsedContext<ModifyPropType<WebdavServer, 'passwdList', RawPasswdInfo[]>>>(
  '/saveWebdavConfig',
  userInfoMiddleware,
  async (ctx) => {
    const newWebdavServer: WebdavServer = {
      ...ctx.request.body,
      passwdList: ctx.request.body.passwdList.map((p) => splitEncPath(p)),
    }

    newWebdavServer.id = crypto.randomUUID()
    logger.info('新增webdav配置信息', JSON.stringify(newWebdavServer))

    webdavServer.push(newWebdavServer)
    fs.writeFileSync(
      process.cwd() + '/conf/config.json',
      JSON.stringify(
        {
          alistServer: alistServer._snapshot,
          webdavServer,
          port,
        },
        undefined,
        '\t'
      )
    )

    logger.info('webdav配置信息已更新')
    ctx.body = response({ data: webdavServer })
  }
)

webuiRouter.all<webui.State, ParsedContext<ModifyPropType<WebdavServer, 'passwdList', RawPasswdInfo[]>>>(
  '/updateWebdavConfig',
  userInfoMiddleware,
  async (ctx) => {
    const config = ctx.request.body
    logger.info('更新webdav配置信息', config.id, config)

    for (const index in webdavServer) {
      if (webdavServer[index].id === config.id) {
        webdavServer[index] = {
          ...config,
          passwdList: ctx.request.body.passwdList.map((p) => splitEncPath(p)),
        }
      }
    }

    fs.writeFileSync(
      process.cwd() + '/conf/config.json',
      JSON.stringify(
        {
          alistServer: alistServer._snapshot,
          webdavServer,
          port,
        },
        undefined,
        '\t'
      )
    )

    logger.info('webdav配置信息已更新')
    ctx.body = response({ data: webdavServer })
  }
)

webuiRouter.all<
  webui.State,
  ParsedContext<{
    id: string
    passwdList: PasswdInfo[]
  }>
>('/delWebdavConfig', userInfoMiddleware, async (ctx) => {
  const { id } = ctx.request.body

  logger.info('删除webdav配置信息', id)

  let indexToDelete = -1 // 初始化索引为-1，表示未找到
  for (const server of webdavServer) {
    if (server.id === id) {
      indexToDelete = webdavServer.indexOf(server) // 找到匹配的元素后，获取其索引
      break // 找到第一个匹配项后退出循环
    }
  }

  if (indexToDelete !== -1) {
    webdavServer.splice(indexToDelete, 1) // 如果找到了匹配的索引，则删除该元素
  }

  fs.writeFileSync(
    process.cwd() + '/conf/config.json',
    JSON.stringify(
      {
        alistServer: alistServer._snapshot,
        webdavServer,
        port,
      },
      undefined,
      '\t'
    )
  )

  logger.info('webdav配置信息已删除', id)
  ctx.body = response({ data: webdavServer })
})

// get folder passwd encode
webuiRouter.all<
  webui.State,
  ParsedContext<{
    password: string
    encType: EncryptType
    folderEncType: string
    folderPasswd: string
  }>
>('/encodeFoldName', userInfoMiddleware, async (ctx) => {
  const { password, encType, folderPasswd, folderEncType } = ctx.request.body

  logger.info('加密文件夹', password, encType, folderPasswd)

  const result = encodeFolderName(password, encType, folderPasswd, folderEncType)
  ctx.body = response({
    data: {
      folderNameEnc: result,
    },
  })

  logger.info('加密结果: ', result)
})

webuiRouter.all<
  webui.State,
  ParsedContext<{
    password: string
    encType: EncryptType
    folderNameEnc: string
  }>
>('/decodeFoldName', userInfoMiddleware, async (ctx) => {
  const { password, folderNameEnc, encType } = ctx.request.body
  const arr = folderNameEnc.split('_')
  logger.info('解密文件夹', password, encType, folderNameEnc)

  if (arr.length < 2) {
    ctx.body = response({ msg: 'folderName not encoded', code: 500 })
    return
  }

  const data = decodeFolderName(password, encType, folderNameEnc)
  if (!data) {
    ctx.body = response({ msg: 'folderName is error', code: 500 })
    return
  }

  const { folderEncType, folderPasswd } = data
  ctx.body = response({ data: { folderEncType, folderPasswd } })

  logger.info('解密结果: ', data)
})

// encrypt or decrypt file
webuiRouter.all<
  webui.State,
  ParsedContext<{
    folderPath: string
    outPath: string
    encType: EncryptType
    encName: string
    password: string
    operation: 'enc' | 'dec'
  }>
>('/encryptFile', userInfoMiddleware, async (ctx) => {
  const { folderPath, outPath, encType, password, operation, encName } = ctx.request.body

  logger.info(`加密本地文件: 源文件夹${folderPath} 目标文件夹:${outPath}`)

  if (!fs.existsSync(folderPath)) {
    ctx.body = response({ msg: 'encrypt file path not exists', code: 500 })
    return
  }

  const files = searchFile(folderPath)

  if (files.length > 10000) {
    ctx.body = response({ msg: 'too many file, exceeding 10000', code: 500 })
    return
  }

  encryptFile(password, encType, operation, folderPath, outPath, encName).then()

  logger.info('加密中，请稍后...')

  ctx.body = response({ msg: 'waiting operation' })
})

export default webuiRouter
