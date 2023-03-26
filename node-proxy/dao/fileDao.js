import levelDB from '../utils/levelDB.js'

export const fileInfoTable = 'fileInfoTable'

// 缓存多少分钟
const cacheTime = 60 * 24

let clearExpire = false

export async function initFileTable() {
  const value = await levelDB.getValue(fileInfoTable)
  if (value == null) {
    await levelDB.setValue(fileInfoTable, {})
  }
}
// 缓存文件信息
export async function cacheFileInfo(fileInfo) {
  // 先清理一下
  if (clearExpire) {
    const value = await getAllFileInfo()
    for (const path in value) {
      const fileInfo = value[path]
      if (!fileInfo._expire || fileInfo._expire < Date.now()) {
        console.log('@clear fileInfo', path)
        delete value[path]
      }
    }
    await levelDB.setValue(fileInfoTable, value)
    clearExpire = false
  }
  // 最好拷贝这个对象不然有可能出问题
  const path = fileInfo.path
  const value = await levelDB.getValue(fileInfoTable)
  fileInfo._expire = Date.now() + 1000 * 60 * cacheTime
  value[path] = fileInfo
  await levelDB.setValue(fileInfoTable, value)
}

// 获取文件信息，偶尔要清理一下缓存
export async function getFileInfo(path) {
  const value = await levelDB.getValue(fileInfoTable)
  return value[path]
}

// 获取文件信息
export async function getAllFileInfo() {
  const value = await levelDB.getValue(fileInfoTable)
  return value
}
// 手动清理
setInterval(async () => {
  clearExpire = true
}, 10 * 1000)
