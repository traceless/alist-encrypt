import { Transform } from 'stream'

export {}
declare global {
  //使得对象中的属性R的类型变为U
  type ModifyPropType<T, R, U> = {
    [K in keyof T]: K extends R ? U : T[K]
  }

  //用到的加解密类型
  type EncryptType = 'mix' | 'rc4' | 'aesctr'

  //具有加解密功能类的接口
  interface EncryptMethod {
    password: string
    passwdOutward: string

    encrypt: (arg1: Buffer) => Buffer
    decrypt: (arg1: Buffer) => Buffer
  }

  //具有流式解密功能类的接口
  interface EncryptFlow extends EncryptMethod {
    encryptTransform: () => Transform
    decryptTransform: () => Transform
    setPositionAsync: (arg1: number) => Promise<EncryptFlow>
  }

  //webui中设置的密码信息
  type PasswdInfo = {
    password: string
    describe: string
    enable: boolean
    encType: EncryptType
    encName: boolean
    encSuffix: string
    encPath: string[]
  }

  //getWebdavFileInfo的返回值
  type WebdavFileInfo = {
    size: number
    name: string
    is_dir: boolean
    path: string
  }

  //定义空对象，相当于{}
  type EmptyObj = Record<string, never>

  //经过bodyParserMiddleware处理后的ParsedContext，ctx.request.body变为对象
  type ParsedContext<T = undefined> = {
    request: {
      body: T
    }
  }

  //webui中设置的单个webdav配置信息
  type WebdavServer = {
    id: string
    name: string
    path: string
    describe: string
    serverHost: string
    serverPort: number
    https: boolean
    enable: boolean
    passwdList: PasswdInfo[]
  }

  //webui中设置的alist配置信息
  type AlistServer = {
    name: string
    path: string
    describe: string
    serverHost: string
    serverPort: number
    https: boolean
    passwdList: PasswdInfo[]
    _snapshot?: {
      name: string
      path: string
      describe: string
      serverHost: string
      serverPort: number
      https: boolean
      passwdList: PasswdInfo[]
    }
  }

  //preProxy后将以下属性添加到ctx.state中供middleware使用
  type ProxiedState<T extends AlistServer | WebdavServer> = {
    isWebdav: boolean
    selfHost: string
    urlAddr: string
    serverAddr: string
    serverConfig: T
    origin: string
    fileSize: number
  }
}
