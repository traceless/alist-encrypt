import nedb from '@/dao/levelDB'

import type { alist } from '@/@types/alist'

export const fileInfoTable = 'fileInfoTable_'

// 缓存多少分钟
const cacheTime = 60 * 24

// 缓存文件信息
export async function cacheFileInfo(fileInfo: alist.FileInfo | WebdavFileInfo) {
  fileInfo.path = decodeURIComponent(fileInfo.path)
  const pathKey = fileInfoTable + fileInfo.path
  await nedb.setExpire(pathKey, fileInfo, 1000 * 60 * cacheTime)
}

// 获取文件信息，偶尔要清理一下缓存
export async function getFileInfo(path: string) {
  const pathKey = decodeURIComponent(fileInfoTable + path)
  return await nedb.getValue(pathKey)
}
