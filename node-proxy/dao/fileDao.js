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
  await levelDB.setValue(fileInfoTable, value)
}

// 获取文件信息，偶尔要清理一下缓存
export async function getFileInfo(path) {
  const value = await levelDB.getValue(fileInfoTable)
  return value[path]
}

// 获取文件信息
export async function getAllFileInfo(path) {
  const value = await levelDB.getValue(fileInfoTable)
  return value
}
