/**
 * 环境变量运行时分发（P1 R3）
 *
 * loadEnv：等价 dotenv v16.3 config 行为（原 src/common/env.js 的解析逻辑原样迁移），
 *   接口 async 化（tjs:fs 仅异步；node sync 包 Promise），文件不存在静默跳过，不覆盖已有值。
 * envGet/envSet：node process.env / tjs.env（tjs.env 为可写对象，赋值回写已实测）。
 *
 * 消费方迁移：src/common/env.js + logger.js 顶层调用在 R5 logger 波次切换，本波不动。
 */
import { IS_TJS } from './isTjs.js'

let nodeFs = null
let tjsFs = null
if (IS_TJS) {
  // tjs 的 fs 能力挂在全局 tjs 对象（tjs.readFile 等），无 'tjs:fs' 模块
  tjsFs = tjs
} else {
  nodeFs = await import('node:fs')
}

const decoder = new TextDecoder()

function envRef() {
  return IS_TJS ? tjs.env : process.env
}

/** 读环境变量（值恒为 string | undefined） */
export function envGet(key) {
  return envRef()[key]
}

/** 写环境变量（与 node/dotenv 语义一致：值转 string） */
export function envSet(key, value) {
  envRef()[key] = String(value)
  return envRef()[key]
}

// 等价 dotenv v16.3 的行解析：export 前缀、: 赋值、单双反引号剥离、双引号内 \n\r 转义、行尾 # 注释
const LINE =
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm

function parse(src) {
  const obj = {}
  let lines = src.toString()
  lines = lines.replace(/\r\n?/gm, '\n')
  let match
  LINE.lastIndex = 0
  while ((match = LINE.exec(lines)) != null) {
    const key = match[1]
    let value = match[2] || ''
    value = value.trim()
    const maybeQuote = value[0]
    value = value.replace(/^(['"`])([\s\S]*)\1$/gm, '$2')
    if (maybeQuote === '"') {
      value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r')
    }
    obj[key] = value
  }
  return obj
}

/**
 * 等价 dotenv.config({ path })：文件不存在等错误静默跳过；不覆盖已有环境变量
 * @param {string} envPath env 文件绝对路径
 */
export async function loadEnv(envPath) {
  let text
  try {
    if (IS_TJS) {
      text = decoder.decode(await tjsFs.readFile(envPath))
    } else {
      text = nodeFs.readFileSync(envPath, 'utf8')
    }
  } catch (e) {
    return // env 文件不存在时静默忽略，与 dotenv 行为一致
  }
  const env = envRef()
  const parsed = parse(text)
  for (const key of Object.keys(parsed)) {
    if (!Object.prototype.hasOwnProperty.call(env, key)) {
      env[key] = parsed[key]
    }
  }
}
