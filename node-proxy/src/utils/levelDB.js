import fs from 'fs'
import path from 'path'
import { DatabaseSync } from 'node:sqlite'

/**
 * 基于 node:sqlite 的 KV 存储（替换 nedb-promises）
 * 数据模型与原 nedb 版一致：key(唯一) -> { expire, value }
 * expire < 0 表示永久；expire > 0 为过期时间戳
 */
class KvStore {
  constructor(dbFile) {
    this.dbFile = dbFile
    fs.mkdirSync(path.dirname(dbFile), { recursive: true })
    this.db = new DatabaseSync(dbFile)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, expire INTEGER NOT NULL, value TEXT NOT NULL)')
    this.setStmt = this.db.prepare('INSERT OR REPLACE INTO kv (key, expire, value) VALUES (?, ?, ?)')
    this.getStmt = this.db.prepare('SELECT expire, value FROM kv WHERE key = ?')
    this.delStmt = this.db.prepare('DELETE FROM kv WHERE key = ?')
    this.purgeStmt = this.db.prepare('DELETE FROM kv WHERE expire > 0 AND expire < ?')
  }

  async load() {
    this.migrateFromNedb()
  }

  // 旧 nedb datafile 是每行一个 JSON 文档（{key, expire, value}），迁移后改名备份
  migrateFromNedb() {
    const oldFile = path.join(path.dirname(this.dbFile), 'datafile')
    if (!fs.existsSync(oldFile)) {
      return
    }
    try {
      const lines = fs.readFileSync(oldFile, 'utf8').trim().split('\n').filter(Boolean)
      let migrated = 0
      for (const line of lines) {
        let doc
        try {
          doc = JSON.parse(line)
        } catch (e) {
          continue
        }
        const { key, expire, value } = doc
        if (typeof key !== 'string' || key === '') {
          continue
        }
        // 已过期的记录不迁移
        if (expire > 0 && expire < Date.now()) {
          continue
        }
        this.setStmt.run(key, expire ?? -1, JSON.stringify(value ?? null))
        migrated++
      }
      const backupFile = `${oldFile}.nedb-backup-${Date.now()}`
      fs.renameSync(oldFile, backupFile)
      console.log('@@nedb migrated:', migrated, 'records ->', this.dbFile, 'backup:', backupFile)
    } catch (e) {
      console.error('@@nedb migrate error', e)
    }
  }

  async setValue(key, value) {
    console.log('@@setValue', key, value)
    this.setStmt.run(key, -1, JSON.stringify(value ?? null))
  }

  async setExpire(key, value, second = 6 * 10) {
    const expire = Date.now() + second * 1000
    this.setStmt.run(key, expire, JSON.stringify(value ?? null))
  }

  async getValue(key) {
    // 原 nedb 语义：非字符串 key（如对象）匹配不到任何记录
    if (typeof key !== 'string') {
      return null
    }
    try {
      const row = this.getStmt.get(key)
      if (!row) {
        return null
      }
      const { expire } = row
      // 没有限制时间
      if (expire < 0) {
        return JSON.parse(row.value)
      }
      if (expire && expire > Date.now()) {
        return JSON.parse(row.value)
      }
    } catch (e) {
      return null
    }
    // 删除过期key
    this.delStmt.run(key)
    return null
  }
}

const nedb = new KvStore(process.cwd() + '/conf/nedb/datafile.db')

// 定时清除过期的数据
setInterval(() => {
  try {
    nedb.purgeStmt.run(Date.now())
  } catch (e) {}
}, 30 * 1000)

export default nedb
