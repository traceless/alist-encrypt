import levelDB from '../utils/levelDB'
import crypto from 'crypto'

export const fileInfoTable = 'fileInfoTable_'

// 缓存多少分钟
const cacheTime = 60 * 24

export async function initFileTable() {
  console.log('init db')
}

// 缓存文件信息，存储文件的中文路径，去掉decodeURIComponent，兼容带%符号的路径
export async function cacheFileInfo(fileInfo, decodeExc) {
  if (decodeExc) fileInfo.path = decodeURI(fileInfo.path)
  const pathKey = fileInfoTable + fileInfo.path
  fileInfo.table = fileInfoTable
  await levelDB.setExpire(pathKey, fileInfo, 1000 * 60 * cacheTime)
}

// 获取文件信息，偶尔要清理一下缓存，这里存储的是真实的文件路径，云盘的路径
export async function getFileInfo(path, decodeExc) {
  let pathKey = fileInfoTable + path
  if (decodeExc) pathKey = decodeURIComponent(pathKey)
  const value = await levelDB.getValue(pathKey)
  return value
}

// 获取文件信息
export async function getAllFileInfo() {
  const value = await levelDB.getValue({ table: fileInfoTable })
  return value
}
