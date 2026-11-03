'use strict'
// tjs 独立入口：tjs run --import-map tjs.importmap.json app.tjs.js
// 裸名模块（path/crypto/stream/fs）由 tjs.importmap.json 映射到 src/runtime/* 适配模块
// CLI convertFile 为 node 专属（app.js），tjs 不提供
import { startupServer } from './src/tjs-server.js'

startupServer()
