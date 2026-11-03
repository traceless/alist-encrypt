/**
 * sqlite 分发（P2）—— levelDB.js 的 node:sqlite ↔ tjs:sqlite 桥
 *
 * node：原样转发 node:sqlite 的 DatabaseSync（行为零变化）。
 * tjs：tjs:sqlite 的 Database 按 node:sqlite API 形态包装：
 *   - DatabaseSync(file) ≙ new Database(file, { create: true, readOnly: false })
 *   - exec/prepare 透传；Statement.run/all 透传
 *   - StatementSync.get ≙ Statement.all(...)[0]：tjs Statement 无 get()，
 *     all() 返回行对象数组（列名为 key，形态与 node:sqlite get 一致，已实测），
 *     无行时 all 返回 []，[0] 为 undefined，与 node:sqlite 语义一致
 */
import { IS_TJS } from './isTjs.js'

let DatabaseSync
if (!IS_TJS) {
  ;({ DatabaseSync } = await import('node:sqlite'))
} else {
  const { Database } = await import('tjs:sqlite')

  class StatementSync {
    constructor(stmt) {
      this._stmt = stmt
    }
    run(...args) {
      return this._stmt.run(...args)
    }
    get(...args) {
      return this._stmt.all(...args)[0]
    }
    all(...args) {
      return this._stmt.all(...args)
    }
  }

  DatabaseSync = class extends Database {
    constructor(dbFile) {
      super(dbFile, { create: true, readOnly: false })
    }
    prepare(sql) {
      return new StatementSync(super.prepare(sql))
    }
  }
}

export { DatabaseSync }
