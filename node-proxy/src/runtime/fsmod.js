/**
 * node:fs 运行时分发（P2）—— tjs.importmap.json 中 'fs' 的映射目标
 *
 * 唯一消费者：convertFile.js 的 CLI 批量加密（fs.createReadStream/createWriteStream + pipe），
 * 服务模式不触达。node 端原样转发 node:fs（零变化）；
 * tjs 下 CLI 转换在入口处已拦截禁用（app.js），此处流式 API 抛错兜底。
 */
import { IS_TJS } from './isTjs.js'

let fs
if (!IS_TJS) {
  fs = await import('node:fs')
} else {
  const CLI_MSG = 'tjs 分支不支持 CLI 文件转换，请使用 node 运行时（node app.js <password> <encType> ...）'
  fs = {
    createReadStream: () => {
      throw new Error('fs.createReadStream: ' + CLI_MSG)
    },
    createWriteStream: () => {
      throw new Error('fs.createWriteStream: ' + CLI_MSG)
    },
  }
}

export default fs
