import levelDB from '../utils/levelDB'

export const fileInfoTable = 'fileInfoTable_'

// 缓存多少小时
const hoursTime = 60 * 60

export async function initFileTable() {
  console.log('init db')
}

// 缓存文件信息，存储文件的云盘真实路径，去掉decodeURIComponent，兼容带%符号的路径
// fileInfo:{name, is_dir, size, path, showPath}
export async function cacheFileInfo(fileInfo, decodeExc = false) {
  if (decodeExc) fileInfo.path = decodeURI(fileInfo.path)
  const pathKey = fileInfoTable + fileInfo.path
  fileInfo.table = fileInfoTable
  await levelDB.setExpire(pathKey, fileInfo, 3 * 24 * hoursTime)
  // 缓存请求展示路径，方便查询对应的加密路径
  if (fileInfo.showPath) {
    console.log('@@basefileInfo.save', fileInfo.showPath)
    await levelDB.setExpire(fileInfoTable + fileInfo.showPath, fileInfo, 3 * 24 * hoursTime)
  }
}

// 获取文件信息，偶尔要清理一下缓存，这里存储的是真实的文件路径，云盘的路径
export async function getFileInfo(path, decodeExc = false) {
  let pathKey = fileInfoTable + path
  if (decodeExc) pathKey = decodeURI(pathKey)
  const value = await levelDB.getValue(pathKey)
  return value
}

// 获取文件信息
export async function getAllFileInfo() {
  const value = await levelDB.getValue({ table: fileInfoTable })
  return value
}
