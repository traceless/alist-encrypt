import levelDB from '../utils/levelDB.js'

export const fileInfoTable = 'fileInfoTable_'

// 缓存多少分钟
const cacheTime = 60 * 24

export async function initFileTable() {}
// 缓存文件信息
export async function cacheFileInfo(fileInfo) {
  const path = fileInfoTable + fileInfo.path
  fileInfo.table = fileInfoTable
  await levelDB.setExpire(path, fileInfo, 1000 * 60 * cacheTime)
}

// 获取文件信息，偶尔要清理一下缓存
export async function getFileInfo(path) {
  path = fileInfoTable + path
  const value = await levelDB.getValue(path)
  return value
}

// 获取文件信息
export async function getAllFileInfo() {
  const value = await levelDB.getValue({ table: fileInfoTable })
  return value
}
