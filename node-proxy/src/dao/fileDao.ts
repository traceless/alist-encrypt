import nedb from '@/dao/levelDB'

import type { alist } from '@/@types/alist'
import { logger } from '@/common/logger'

export const fileInfoTable = 'fileInfoTable_'

// 缓存多少分钟
const cacheTime = 60 * 24

// 缓存文件信息
export async function cacheFileInfo(fileInfo: alist.FileInfo | WebdavFileInfo) {
  fileInfo.path = decodeURIComponent(fileInfo.path)
  const pathKey = fileInfoTable + fileInfo.path
  logger.info(`FileDao 保存文件信息: ${pathKey}`)
  await nedb.setExpire(pathKey, fileInfo, 1000 * 60 * cacheTime)
}

// 获取文件信息，偶尔要清理一下缓存
export async function getFileInfo(path: string): Promise<alist.FileInfo | WebdavFileInfo | null> {
  const pathKey = decodeURIComponent(fileInfoTable + path)
  logger.info(`FileDao 获取文件信息: ${pathKey}`)
  return await nedb.getValue(pathKey)
}

export async function deleteFileInfo(path: string) {
  const pathKey = decodeURIComponent(fileInfoTable + path)
  logger.info(`FileDao 删除文件信息: ${pathKey}`)
  await nedb.datastore.removeMany({ key: pathKey }, {})
}
