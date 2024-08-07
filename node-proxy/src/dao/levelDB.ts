import Datastore from 'nedb-promises'

import { logger } from '@/common/logger'

type Value = any

interface Document {
  _id: string //NeDB 自动添加 _id
  key: string
  value: Value
  expire?: number
}

/**
 * 封装新方法
 */
class Nedb {
  datastore: Datastore<Document>

  init(dbFile: string) {
    this.datastore = Datastore.create(dbFile)
  }

  async load() {
    if (!this.datastore) {
      logger.error('请先init Nedb')
    }

    await this.datastore.load()

    setInterval(async () => {
      const allData = await nedb.datastore.find({})
      for (const data of allData) {
        const { key, expire } = data
        if (expire && expire > 0 && expire < Date.now()) {
          logger.info('删除过期键值', key, expire, Date.now())
          await nedb.datastore.remove({ key }, {})
        }
      }
    }, 30 * 1000)
  }

  //存值，无过期时间
  async setValue(key: string, value: Value) {
    await this.datastore.removeMany({ key }, {})
    logger.trace('存储键值(无过期时间)', key, JSON.stringify(value))
    await this.datastore.insert({ key, expire: -1, value })
  }

  // 存值，有过期时间
  async setExpire(key: string, value: Value, second = 6 * 10) {
    await this.datastore.removeMany({ key }, {})
    const expire = Date.now() + second * 1000
    logger.trace(`存储键值(过期时间${expire})`, key, JSON.stringify(value))
    await this.datastore.insert({ key, expire, value })
  }

  // 取值
  async getValue(key: string): Promise<Value> {
    try {
      const { expire, value } = await this.datastore.findOne({ key })
      // 没有限制时间
      if (expire < 0) {
        return value
      }

      if (expire && expire > Date.now()) {
        return value
      }

      await this.datastore.remove({ key }, {})
      return null
    } catch (e) {
      return null
    }
  }
}

const nedb = new Nedb()

export default nedb
