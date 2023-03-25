import levelDB from '../utils/levelDB.js'

export const fileInfoTable = 'fileInfoTable'

export async function initFileTable() {
  const value = await levelDB.getValue(fileInfoTable)
  if (value == null) {
    await levelDB.setValue(fileInfoTable, {})
  }
}
// 缓存文件信息
export async function cacheFileInfo(fileInfo) {
  // 最好拷贝这个对象不然有可能出问题
  const path = fileInfo.path
  const value = await levelDB.getValue(fileInfoTable)
  value[path] = fileInfo
  await levelDB.setExpire(fileInfoTable, value, 60 * 60 * 24 * 7)
}

// 获取文件信息
export async function getFileInfo(path) {
  const value = await levelDB.getValue(fileInfoTable)
  return value[path]
}

// 获取文件信息
export async function getAllFileInfo(path) {
  const value = await levelDB.getValue(fileInfoTable)
  return value
}
