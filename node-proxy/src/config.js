import fs from 'fs'
import { addUserInfo, getUserInfo } from './dao/userDao.js'
import nedb from './utils/levelDB.js'

// inti config, fix ncc get local conf
function getConfPath() {
  return process.cwd() + '/conf'
}

// 初始化目录
if (!fs.existsSync(getConfPath())) {
  // fs.mkdirSync(path.resolve('conf'))
  fs.mkdirSync(process.cwd() + '/conf')
}

/** 全局代理alist，包括它的webdav和http服务，要配置上 */
const alistServerTemp = {
  name: 'alist',
  path: '/*', // 默认就是代理全部，保留字段
  describe: 'alist 配置',
  serverHost: '192.168.1.100',
  serverPort: 5244,
  https: false,
  passwdList: [
    {
      password: '123456',
      describe: 'my video', // 加密内容描述
      encType: 'aesctr', // 算法类型，可选mix，rc4，默认aesctr
      enable: true, // enable encrypt
      encName: false, // encrypt file name
      encSuffix: '', //
      encPath: ['encrypt_folder/*', '/189cloud/atest/*'], // 路径支持正则表达式，常用的就是 尾巴带*，此目录的所文件都加密
    },
  ],
}

/** 支持其他普通的webdav，当然也可以挂载alist的webdav，但是上面配置更加适合 */
const webdavServerTemp = [
  {
    id: 'abcdefg',
    name: 'other-webdav',
    describe: 'webdav 电影',
    path: '^/test_dav_dir/*', // 代理全部路径，需要重启后生效。不能是"/enc-api/*" ，系统已占用。如果设置 "/*"，那么上面的alist的配置就不会生效哦
    enable: false, // 是否启动代理，需要重启后生效
    serverHost: '192.168.1.100',
    serverPort: 5244,
    https: false,
    passwdList: [
      {
        password: '123456',
        encType: 'aesctr', // 密码类型，mix：速度更快适合电视盒子之类，rc4: 更安全，速度比mix慢一点，几乎无感知。
        describe: 'my video',
        enable: false,
        encName: false, // encrypt file name
        encNameSuffix: '', //
        encPath: ['encrypt_folder/*', '/dav/189cloud/*'], // 子路径
      },
    ],
  },
]

// inti config, fix ncc get local conf
function getConfFilePath() {
  return process.cwd() + '/conf/config.json'
}

const exist = fs.existsSync(getConfFilePath())
if (!exist) {
  // 把默认数据写入到config.json
  const configData = { alistServer: alistServerTemp, webdavServer: webdavServerTemp, port: 5344 }
  fs.writeFileSync(getConfFilePath(), JSON.stringify(configData, '', '\t'))
}
// 读取配置文件
const configJson = fs.readFileSync(getConfFilePath(), 'utf8')
const configData = JSON.parse(configJson)

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
  fs.writeFileSync(process.cwd() + '/conf/config.json', JSON.stringify(configData, '', '\t'))
}

/** 初始化用户的数据库 */
async function init() {
  try {
    await nedb.load()
    let admin = await getUserInfo('admin')
    // 初始化admin账号
    if (admin == null) {
      admin = { username: 'admin', headImgUrl: '/public/logo.svg', password: '123456', roleId: '[13]' }
      await addUserInfo(admin)
    }
    console.log('@@init', admin)
  } catch (e) {}
}
init()

// 副本用于前端更新, Object.assign({}, configData.alistServer) 只有第一层的拷贝
configData.alistServer._snapshot = JSON.parse(JSON.stringify(configData.alistServer))
export function initAlistConfig(alistServerConfig) {
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

export const version = '0.2.9'

export const alistServer = configData.alistServer || alistServerTemp

export const webdavServer = configData.webdavServer || webdavServerTemp

console.log('configData ', configData)
