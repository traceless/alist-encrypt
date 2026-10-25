'use strict'

import { Hono } from 'hono'
import crypto from 'crypto'
import fs from 'fs'
import { alistServer, webdavServer, port, initAlistConfig, version } from './config.js'
import { getUserInfo, cacheUserToken, getUserByToken, updateUserInfo } from './dao/userDao.js'
import responseHandle from './middleware/responseHandle.js'
import bodyParser from './middleware/bodyParser.js'
import { encodeFromFolder, decodeFromFolder } from './utils/commonUtil.js'
import path from 'path'
import { encryptFile, searchFile } from './utils/convertFile.js'
import { logger } from './common/logger.js'

// 总路径，添加所有的子路由
const allRouter = new Hono()

// 拦截全部，解析body并统一包装响应
allRouter.use('/enc-api/*', bodyParser, responseHandle, async (c, next) => {
  logger.debug('@@log request-url: ', c.env.incoming.url)
  await next()
})

// 白名单路由
allRouter.all('/enc-api/login', async (c) => {
  const { username, password } = c.get('requestBody')
  const userInfo = await getUserInfo(username)
  logger.debug('@@login', username)
  if (userInfo && password === userInfo.password) {
    // 创建token
    const token = crypto.randomUUID()
    // 异步执行
    cacheUserToken(token, userInfo)
    userInfo.password = null
    return c.json({ data: { userInfo, jwtToken: token } })
  }
  return c.json({ msg: 'passwword error', code: 500 })
})

// 拦截登录
allRouter.use('/enc-api/*', async (c, next) => {
  // nginx不支持下划线headers
  const authorizeToken = c.req.header('authorizetoken')
  // 查询数据库是否有密码
  const userInfo = await getUserByToken(authorizeToken)
  if (userInfo == null) {
    return c.json({ code: 401, msg: 'user unlogin' })
  }
  c.set('userInfo', userInfo)
  await next()
})

// /index 短地址
allRouter.get('/index', (c) => c.redirect('/public/index.html', 302))

// 用户信息
allRouter.all('/enc-api/getUserInfo', async (c) => {
  const userInfo = c.get('userInfo')
  logger.debug('@@getUserInfo', userInfo.username)
  userInfo.password = null
  const data = {
    codes: [16, 9, 10, 11, 12, 13, 15],
    userInfo,
    menuList: [],
    roles: ['admin'],
    version,
  }
  return c.json({ data })
})

// 更新用户信息
allRouter.all('/enc-api/updatePasswd', async (c) => {
  const { password, newpassword, username } = c.get('requestBody')
  if (newpassword.length < 8) {
    return c.json({ msg: 'password too short, at least 8 digits', code: 500 })
  }
  const userInfo = await getUserInfo(username)
  if (password !== userInfo.password) {
    return c.json({ msg: 'password error', code: 500 })
  }
  userInfo.password = newpassword
  updateUserInfo(userInfo)
  return c.json({ msg: 'update success' })
})

allRouter.all('/enc-api/getAlistConfig', async (c) => {
  return c.json({ data: alistServer._snapshot })
})

allRouter.all('/enc-api/saveAlistConfig', async (c) => {
  let alistConfig = c.get('requestBody')
  for (const index in alistConfig.passwdList) {
    const passwdInfo = alistConfig.passwdList[index]
    if (typeof passwdInfo.encPath === 'string') {
      passwdInfo.encPath = passwdInfo.encPath.split(',')
    }
  }
  const _snapshot = JSON.parse(JSON.stringify(alistConfig))
  // 写入到文件中，这里并不是真正的同步，，
  fs.writeFileSync(process.cwd() + '/conf/config.json', JSON.stringify({ alistServer: _snapshot, webdavServer, port }, '', '\t'))
  alistConfig = initAlistConfig(alistConfig)
  Object.assign(alistServer, alistConfig)
  alistServer._snapshot = _snapshot
  return c.json({ msg: 'save ok' })
})

allRouter.all('/enc-api/getWebdavConfig', async (c) => {
  return c.json({ data: webdavServer })
})

allRouter.all('/enc-api/saveWebdavConfig', async (c) => {
  const config = c.get('requestBody')
  for (const index in config.passwdList) {
    const passwdInfo = config.passwdList[index]
    if (typeof passwdInfo.encPath === 'string') {
      passwdInfo.encPath = passwdInfo.encPath.split(',')
    }
  }
  config.id = crypto.randomUUID()
  webdavServer.push(config)
  fs.writeFileSync(process.cwd() + '/conf/config.json', JSON.stringify({ alistServer: alistServer._snapshot, webdavServer, port }, '', '\t'))
  return c.json({ data: webdavServer })
})

allRouter.all('/enc-api/updateWebdavConfig', async (c) => {
  const config = c.get('requestBody')
  for (const index in config.passwdList) {
    const passwdInfo = config.passwdList[index]
    if (typeof passwdInfo.encPath === 'string') {
      passwdInfo.encPath = passwdInfo.encPath.split(',')
    }
  }

  for (const index in webdavServer) {
    if (webdavServer[index].id === config.id) {
      webdavServer[index] = config
    }
  }
  fs.writeFileSync(process.cwd() + '/conf/config.json', JSON.stringify({ alistServer: alistServer._snapshot, webdavServer, port }, '', '\t'))
  return c.json({ data: webdavServer })
})

allRouter.all('/enc-api/delWebdavConfig', async (c) => {
  const { id } = c.get('requestBody')
  for (const index in webdavServer) {
    if (webdavServer[index].id === id) {
      webdavServer.splice(index, 1)
    }
  }
  fs.writeFileSync(process.cwd() + '/conf/config.json', JSON.stringify({ alistServer: alistServer._snapshot, webdavServer, port }, '', '\t'))
  return c.json({ data: webdavServer })
})
// get folder passwd encode
allRouter.all('/enc-api/encodeFoldName', async (c) => {
  const { password, encType, folderPasswd, folderEncType } = c.get('requestBody')
  const folderNameEnc = encodeFromFolder(password, encType, folderPasswd, folderEncType)
  return c.json({ data: { folderNameEnc } })
})

allRouter.all('/enc-api/decodeFoldName', async (c) => {
  const { password, folderNameEnc, encType } = c.get('requestBody')
  const arr = folderNameEnc.split('&')
  if (arr.length < 2) {
    return c.json({ msg: 'folderName not encdoe', code: 500 })
  }
  const data = decodeFromFolder(password, encType, folderNameEnc)
  if (!data) {
    return c.json({ msg: 'folderName is error', code: 500 })
  }
  const { folderEncType, folderPasswd } = data
  return c.json({ data: { folderEncType, folderPasswd } })
})

// encrypt or decrypt local file
allRouter.all('/enc-api/encryptFile', async (c) => {
  const { folderPath, outPath, encType, password, operation, encName } = c.get('requestBody')
  // 绝对路径化后再扫描，保证与任务内部的 substring 截取基准一致
  const folderPathAbs = path.isAbsolute(folderPath) ? folderPath : path.join(process.cwd(), folderPath)
  if (!fs.existsSync(folderPathAbs)) {
    return c.json({ msg: 'encrypt file path not exists', code: 500 })
  }
  // 异步扫描一次，结果传给任务复用（原版 router/任务各扫一遍且全同步阻塞事件循环）
  const files = await searchFile(folderPathAbs)
  if (files.length > 10000) {
    return c.json({ msg: 'too maney file, exceeding 10000', code: 500 })
  }
  // 长任务 fire-and-forget：必须挂 catch，否则任何异常都会以 unhandledRejection 打崩整个代理进程
  encryptFile(password, encType, operation, folderPathAbs, outPath, encName, files).catch((err) => {
    logger.error('@@encryptFile task error', err)
  })
  return c.json({ msg: 'waiting operation' })
})

export default allRouter
