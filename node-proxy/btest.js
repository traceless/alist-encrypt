// import PRGAExcuteThread from './utils/PRGAThread.js'
import os from 'os'
import Rc4 from './utils/rc4.js'
import { cacheFileInfo, initFileTable, getFileInfo, getAllFileInfo } from './dao/fileDao.js'

// 初始化目录
const rc4 = new Rc4('123456', 12)
rc4.setPosition(12)
const buffer = rc4.encryptText('abc')
// 要记得重置
const plainBy = rc4.setPosition(12).encrypt(buffer)
console.log('@@@', buffer, Buffer.from(plainBy).toString('utf-8'))

async function start() {
  await initFileTable()
  const fileInfo = {
    name: 'test3',
    size: 0,
    is_dir: true,
    modified: '2023-03-24T02:10:22.942Z',
    sign: '',
    thumb: '',
    type: 1,
  }
  fileInfo.path = '/aliy/test/test3/9A%84%E5%89%AF%E6%9C%AC36.txt'

  await cacheFileInfo(fileInfo)
  const data = await getFileInfo(fileInfo.path)

  console.log(data)

  setTimeout(() => {
    cacheFileInfo(fileInfo)
  }, 12 * 1000)
}

setTimeout(() => {
  start()
}, 200)
