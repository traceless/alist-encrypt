import path from 'path'
import fs from 'fs'

// 初始化目录
if (!fs.existsSync(path.resolve('conf'))) {
  fs.mkdirSync(path.resolve('conf'))
}

/** 全局代理alist，包括它的webdav和http服务，要配置上 */
const alistServerTemp = {
  path: '/*', // 默认就是代理全部，不建议修改这里
  serverHost: '127.0.0.1',
  serverPort: 5244,
  flowPassword: '123456', // 加密的密码
  encPath: ['/aliyun/test/*', '/aliyun/photo/*', '/189cloud/*'], // 注意不需要添加/dav 前缀了，程序会自己处理alist的逻辑
}

/** 支持其他普通的webdav，当然也可以挂载alist的webdav，但是上面配置更加适合 */
const webdavServerTemp = [
  {
    name: 'aliyun',
    path: '/dav/*', // 代理全部路径，不能是"/proxy/*"，系统已占用。如果设置 "/*"，那么上面的alist的配置就不会生效哦
    enable: false, // 是否启动代理
    serverHost: '127.0.0.1',
    serverPort: 5244,
    flowPassword: '123456', // 加密的密码
    encPath: ['/dav/aliyun/*', '/dav/189cloud/*'], // 要加密的目录，不能是 "/*" 和 "/proxy/*"，因为已经占用
  },
]
const exist = fs.existsSync(path.resolve('conf/config.json'))

if (!exist) {
  // 把默认数据写入到config.json
  const configJson = JSON.stringify({ alistServer: alistServerTemp, webdavServer: webdavServerTemp })
  fs.writeFileSync(path.resolve('conf/config.json'), configJson, { flag: 'w' })
}
// 读取配置文件
const configJson = fs.readFileSync(path.resolve('conf/config.json'), 'utf8')
const configData = JSON.parse(configJson)

/** 会当作Md5的salt，当前预留配置，暂时没用到 */
export const userPasswd = configData.userPasswd || '123456'

/** 代理服务的端口 */
export const port = configData.port || 5344

export const alistServer = configData.alistServer || alistServerTemp

export const webdavServer = configData.webdavServer || webdavServerTemp

console.log('configData ', configData)
