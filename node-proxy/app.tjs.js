'use strict'
// tjs 独立入口：tjs run --import-map tjs.importmap.json app.tjs.js
// 裸名模块（path/crypto/stream/fs）由 tjs.importmap.json 映射到 src/runtime/* 适配模块
// CLI convertFile 为 node 专属（app.js），tjs 不提供 —— 检测到额外参数时明确报错退出，
// 避免用户以为转换已执行、实际只是起了服务
import './src/runtime/globals.tjs.js'
import { startupServer } from './src/tjs-server.js'
import { fatalExit } from './src/runtime/isTjs.js'

// tjs.args = [exe, 'run', ...flags, script, ...userArgs]，--import-map 等 flag 插在脚本前，
// 故按脚本后缀定位而非固定下标（已实测：['tjs', 'run', '--import-map', 'map.json', 'app.tjs.js', ...]）
const argv = (globalThis.tjs && tjs.args) || []
const scriptIdx = argv.findIndex((a) => /\.m?js$/i.test(String(a)))
const userArgs = scriptIdx === -1 ? [] : argv.slice(scriptIdx + 1)

if (userArgs.length) {
  console.error(
    '[tjs] 不支持 CLI 批量加解密（convertFile），请改用 node 运行时：\n' +
      '  node app.js <password> <encType> <enc|dec> <folder> <outPath> [encName]'
  )
  fatalExit(1)
} else {
  startupServer()
}
