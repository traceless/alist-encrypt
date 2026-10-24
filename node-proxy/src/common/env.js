import fs from 'fs'

// 等价 dotenv v16.3 的行解析：export 前缀、: 赋值、单双反引号剥离、双引号内 \n\r 转义、行尾 # 注释
const LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg

function parse(src) {
  const obj = {}
  let lines = src.toString()
  // Convert line breaks to same format
  lines = lines.replace(/\r\n?/mg, '\n')
  let match
  LINE.lastIndex = 0
  while ((match = LINE.exec(lines)) != null) {
    const key = match[1]
    let value = match[2] || ''
    value = value.trim()
    const maybeQuote = value[0]
    value = value.replace(/^(['"`])([\s\S]*)\1$/mg, '$2')
    if (maybeQuote === '"') {
      value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r')
    }
    obj[key] = value
  }
  return obj
}

/**
 * 等价 dotenv.config({ path })：文件不存在等错误静默跳过；不覆盖 process.env 已有值
 * @param {string} envPath env 文件绝对路径
 */
export function loadEnv(envPath) {
  try {
    const parsed = parse(fs.readFileSync(envPath, 'utf8'))
    for (const key of Object.keys(parsed)) {
      if (!Object.prototype.hasOwnProperty.call(process.env, key)) {
        process.env[key] = parsed[key]
      }
    }
  } catch (e) {
    // env 文件不存在时静默忽略，与 dotenv 行为一致
  }
}
