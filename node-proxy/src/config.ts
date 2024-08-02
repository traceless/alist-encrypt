import fs from 'fs'
import path from 'path'

import nedb from '@/dao/levelDB'
import { logger } from '@/common/logger'
import { addUserInfo, getUserInfo } from '@/dao/userDao'

let serverHost = '192.168.1.100'
let serverPort = 5244

// 从环境变量上读取配置信息，docker首次启动时候可以直接进行配置
const serverAddr = process.env.ALIST_HOST
if (serverAddr && serverAddr.indexOf(':') > 6) {
  serverHost = serverAddr.split(':')[0]
  serverPort = Number(serverAddr.split(':')[1])
}

logger.info(`Alist地址: ${serverHost}:${serverPort}`)

/** 全局代理alist，包括它的webdav和http服务，要配置上 */
const alistServerTemp: AlistServer = {
  name: 'alist',
  path: '/*', // 默认就是代理全部，保留字段
  describe: 'alist 配置',
  serverHost,
  serverPort,
  https: false,
  passwdList: [
    {
      password: '123456',
      describe: 'my video', // 加密内容描述
      enable: true, // enable encrypt
      encType: 'aesctr', // 算法类型，可选mix，rc4，默认aesctr
      encName: false, // encrypt file name
      encSuffix: '', //
      encPath: ['encrypt_folder/*', 'movie_encrypt/*'], // 路径支持正则表达式，常用的就是 尾巴带*，此目录的所文件都加密
    },
  ],
}

/** 支持其他普通的webdav，当然也可以挂载alist的webdav，但是上面配置更加适合 */
const webdavServerTemp: WebdavServer[] = [
  {
    id: 'abcdefg',
    name: 'other-webdav',
    describe: 'webdav 电影',
    path: '^/test_dav_dir/*', // 代理全部路径，需要重启后生效。不能是"/enc-api/*" ，系统已占用。如果设置 "/*"，那么上面的alist的配置就不会生效哦
    enable: false, // 是否启动代理，需要重启后生效
    serverHost,
    serverPort,
    https: false,
    passwdList: [
      {
        password: '123456',
        describe: 'my video',
        enable: false,
        encType: 'aesctr', // 密码类型，mix：速度更快适合电视盒子之类，rc4: 更安全，速度比mix慢一点，几乎无感知。
        encName: false, // encrypt file name
        encSuffix: '', //
        encPath: ['encrypt_folder/*', '/dav/189cloud/*'], // 子路径
      },
    ],
  },
]

// inti config, fix ncc get local conf
const confPath = path.join(process.cwd(), 'conf')
const confFile = path.join(confPath, 'config.json')

nedb.init(path.join(confPath, ``, 'nedb', 'datafile'))

// 初始化目录
if (!fs.existsSync(confPath)) {
  fs.mkdirSync(confPath)
}

if (!fs.existsSync(confFile)) {
  const configData = { alistServer: alistServerTemp, webdavServer: webdavServerTemp, port: 5344 }
  fs.writeFileSync(confFile, JSON.stringify(configData, undefined, '\t'))
}

// 读取配置文件
const configData = JSON.parse(fs.readFileSync(confFile, 'utf8'))

// 兼容之前的数据进来，保留2个版
if (configData.alistServer.flowPassword) {
  const alistServer = configData.alistServer
  alistServer.passwdList = []
  alistServer.passwdList.push({
    password: alistServer.flowPassword,
    encType: alistServer.encryptType,
    encPath: alistServer.encPath,
  })
  delete alistServer.flowPassword
  delete alistServer.encryptType
  delete alistServer.encPath
  configData.webdavServer = webdavServerTemp
  fs.writeFileSync(confFile, JSON.stringify(configData, undefined, '\t'))
}

/** 初始化用户的数据库 */
;(async () => {
  try {
    await nedb.load()
    let admin = await getUserInfo('admin')
    // 初始化admin账号
    if (admin == null) {
      admin = { username: 'admin', headImgUrl: '/public/logo.svg', password: '123456', roleId: '[13]' }
      await addUserInfo(admin)
    }
    logger.info('管理员信息: ', admin)
  } catch (e) {}
})().then()

// 副本用于前端更新, Object.assign({}, configData.alistServer) 只有第一层的拷贝
configData.alistServer._snapshot = JSON.parse(JSON.stringify(configData.alistServer))

export function initAlistConfig(alistServerConfig: AlistServer) {
  // 初始化alist的路由，新增/d/* 路由
  let downloads = []
  for (const passwdData of alistServerConfig.passwdList) {
    for (const key in passwdData.encPath) {
      downloads.push('/d' + passwdData.encPath[key])
      downloads.push('/p' + passwdData.encPath[key])
      downloads.push('/dav' + passwdData.encPath[key])
    }
    // 处理alist的逻辑
    passwdData.encPath = passwdData.encPath.concat(downloads)
    downloads = []
  }
  return alistServerConfig
}

/** 初始化alist的一些路径 */
initAlistConfig(configData.alistServer)

/** 代理服务的端口 */
export const port = configData.port || 5344

export const version = '0.3.0'

export const alistServer: AlistServer = configData.alistServer || alistServerTemp

export const webdavServer: WebdavServer[] = configData.webdavServer || webdavServerTemp

logger.info('代理配置 ', configData)
