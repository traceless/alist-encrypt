import Datastore from 'nedb-promises'

// let datastore = Datastore.create('/path/to/db.db')
/**
 * 继承接口，定义新方法
 */
class Nedb extends Datastore {
  constructor(dbFile) {
    // this.super()
    this.datastore = Datastore.create(dbFile)
  }

  async load() {
    await this.datastore.load()
  }

  // 新增过期设置
  async setValue(key, value) {
    await this.datastore.removeMany({ key })
    console.log('@@setValue', key, value )
    await this.datastore.insert({ key, expire: -1, value })
  }

  async setExpire(key, value, second = 6 * 10) {
    await this.datastore.removeMany({ key })
    const expire = Date.now() + second * 1000
    await this.datastore.insert({ key, expire, value })
  }

  async getValue(key) {
    try {
      const { expire, value } = await this.datastore.findOne({ key })
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
    this.datastore.remove(key)
    return null
  }
}

const nedb = new Nedb(process.cwd() + '/conf/nedb/datafile')

// 定时清除过期的数据
setInterval(async () => {
  const allData = await nedb.datastore.find({})
  for (const data of allData) {
    const { key, expire } = data
    if (expire && expire > 0 && expire < Date.now()) {
      console.log('@@expire:', key, expire, Date.now())
      nedb.datastore.remove({ key })
    }
  }
}, 30 * 1000)

export default nedb
