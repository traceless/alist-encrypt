import fs from 'fs'
import path from 'path'
import { format } from 'util'
import { loadEnv } from './env.js'

// 等价原 dotenv.config('./env') 的实际行为：字符串参数被 dotenv 忽略，实际加载 process.cwd()/.env
loadEnv(path.resolve(process.cwd(), '.env'))

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }

// 等价 log4js basic layout：[2026-10-23T22:22:13.706] [INFO] category - message
function layout(level, category, msg) {
  const d = new Date()
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`
  return `[${ts}] [${level.toUpperCase()}] ${category} - ${msg}`
}

class Logger {
  constructor(category, level, fileStream) {
    this.category = category
    this.level = LEVELS[level]
    this.fileStream = fileStream
  }
  _log(level, args) {
    if (LEVELS[level] < this.level) return
    const line = layout(level, this.category, format(...args)) + '\n'
    process.stdout.write(line)
    if (this.fileStream) this.fileStream.write(line)
  }
  debug(...args) {
    this._log('debug', args)
  }
  info(...args) {
    this._log('info', args)
  }
  warn(...args) {
    this._log('warn', args)
  }
  error(...args) {
    this._log('error', args)
  }
}

// logs/server.log 追加写，等价 log4js file appender（原配置无 pattern，不滚动）
fs.mkdirSync(path.join(process.cwd(), 'logs'), { recursive: true })
const fileStream = fs.createWriteStream(path.join(process.cwd(), 'logs', 'server.log'), { flags: 'a' })

// 原 log4js 配置：default = console+fileLogs/info；debug category 仅 console/debug。
// 原代码 DEV 分支传了不存在的 category 'info'，log4js 回落 default，即 DEV/生产实际同配置（debug 全被过滤）。
// 此处保持 default（console+fileLogs）配置等价；DEV 模式仅将级别放宽到 debug（唯一差异：DEV 下输出 debug 日志）
const level = process.env.RUN_MODE === 'DEV' ? 'debug' : 'info'
export const logger = new Logger('default', level, fileStream)
