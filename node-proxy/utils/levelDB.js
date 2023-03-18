import { Level } from 'level'
import path from 'path'

/**
 * 继承接口，定义新方法
 */
class LevelDB extends Level {
  // 新增过期设置
  async putValue(key, value, second = 60 * 10) {
    const expire = Date.now() + second * 1000
    const data = { expire, value }
    return await this.put(key, data)
  }

  async getValue(key) {
    try {
      const { expire, value } = await this.get(key)
      if (expire && expire > Date.now()) {
        return value
      }
    } catch (e) {
      return null
    }
    // 删除key
    levelDB.del(key)
    return null
  }
}
const levelDB = new LevelDB(path.resolve('conf/db-data'), { valueEncoding: 'json' })
// 定时清除过期的数据
setInterval(async () => {
  for await (const [key, data] of levelDB.iterator()) {
    const { expire } = data
    if (expire && expire < Date.now()) {
      console.log('@@expire:', key, expire, Date.now())
      levelDB.del(key)
    }
  }
}, 30 * 1000)
export default levelDB
