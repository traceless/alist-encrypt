import levelDB from '@/utils/levelDB'

export const configTable = 'configTable'

export async function initConfigTable() {
}
// alist配置
const alistConfigKey = '_alist_config_key'
export async function updateAlistConfig(config) {
  await levelDB.setValue(alistConfigKey, config)
}
export async function getAlistConfig() {
  return await levelDB.getValue(alistConfigKey)
}

// 缓存文件信息
export async function addOrUpdateWebdav(config) {
  const id = config.id
  const value = await levelDB.getValue(configTable)
  value[id] = config
  await levelDB.setValue(configTable, value)
}

export async function delWebdavConfig(config) {
  const id = config.id
  const value = await levelDB.getValue(configTable)
  delete value[id]
  await levelDB.setValue(configTable, value)
}
