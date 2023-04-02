import { Level } from 'level'
import path from 'path'

/**
 * 继承接口，定义新方法
 */
class LevelDB extends Level {
  // 新增过期设置
  async setValue(key, value) {
    const data = { expire: -1, value }
    await this.put(key, data)
  }

  async setExpire(key, value, second = 6 * 10) {
    const expire = Date.now() + second * 1000
    const data = { expire, value }
    await this.put(key, data)
  }

  async getValue(key) {
    try {
      const { expire, value } = await this.get(key)
      // 没有限制时间
      if (expire < 0) {
        return value
      }
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
const levelDB = new LevelDB(process.cwd() + '/conf/db-data', { valueEncoding: 'json' })
// 定时清除过期的数据
setInterval(async () => {
  for await (const [key, data] of levelDB.iterator()) {
    // 可能是无限制度
    const { expire } = data
    if (expire && expire > 0 && expire < Date.now()) {
      console.log('@@expire:', key, expire, Date.now())
      levelDB.del(key)
    }
  }
}, 30 * 1000)
export default levelDB
