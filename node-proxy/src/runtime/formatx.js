/**
 * logger 格式化运行时（P1 R5）—— node util.format 的"无占位符"子集 + 精简 inspect
 *
 * 决策（用户拍板）：全项目 69 处 logger 调用均为多参数拼接、0 处使用 %s/%d 等占位符，
 * 故**不支持占位符**——第一个参数中的 % 字符原样输出（与 node util.format 的唯一语义差异）。
 * 双端（node/tjs）共用同一份纯 JS 实现，天然一致。
 *
 * format 语义（对齐 node 无占位符路径）：
 * - 所有参数空格 join：string 原样、其它走内置 inspect
 * - inspect 对齐 node v22 实测形态：字符串选引号转义、整数键升序+symbol 键殿后、
 *   depth>2 截断（[Object]/[Array]）、Map/Set/TypedArray/Date/RegExp/函数
 *
 * 有意精简（与 node inspect 的差异，锁定于 test/runtime-test.mjs 向量）：
 * - Error 仅输出 `${name}: ${message}`，不带堆栈（tjs 无法复刻 V8 堆栈格式）
 * - 数组不做 maxArrayLength 截断；字符串不做单行截断
 */

const MAX_DEPTH = 2 // 对齐 node inspect 默认 depth（depth > 2 才截断）

const ESCAPES = { "'": "\\'", '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t' }

function quoteString(s) {
  // node 风格：优先单引号包裹并转义；含单引号且无双引号时改用双引号（此时不转义单引号）
  if (s.includes("'") && !s.includes('"')) return `"${s.replace(/[\\\n\r\t]/g, (c) => ESCAPES[c])}"`
  return `'${s.replace(/['\\\n\r\t]/g, (c) => ESCAPES[c])}'`
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/

// node 键序：整数键（十进制非负整数字符串）按数值升序排最前，symbol 键殿后，其余按插入序
function objectKeys(obj) {
  const numKeys = []
  const strKeys = []
  const symKeys = []
  for (const k of Reflect.ownKeys(obj)) {
    if (typeof k === 'symbol') symKeys.push(k)
    else if (/^\d+$/.test(k)) numKeys.push(k)
    else strKeys.push(k)
  }
  numKeys.sort((a, b) => Number(a) - Number(b))
  return [...numKeys, ...strKeys, ...symKeys]
}

function keyDisplay(key) {
  if (typeof key === 'symbol') return `[${key.toString()}]`
  if (IDENT_RE.test(key)) return key
  return quoteString(key)
}

function inspect(value, depth, seen, maxDepth) {
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'string') return quoteString(value)
  if (t === 'number') return Object.is(value, -0) ? '-0' : String(value)
  if (t === 'bigint') return `${value}n`
  if (t === 'boolean' || t === 'undefined') return String(value)
  if (t === 'symbol') return value.toString()
  if (t === 'function') return value.name ? `[Function: ${value.name}]` : '[Function (anonymous)]'

  // object 及以下
  if (seen.includes(value)) return '[Circular]'
  if (value instanceof Error) return `${value.name}: ${value.message}` // 精简：不带堆栈
  if (value instanceof Date) return isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString()
  if (value instanceof RegExp) return String(value)
  if (depth > maxDepth) return Array.isArray(value) ? '[Array]' : '[Object]'

  seen.push(value)
  let res
  if (Array.isArray(value)) {
    res = value.length === 0 ? '[]' : `[ ${value.map((v) => inspect(v, depth + 1, seen, maxDepth)).join(', ')} ]`
  } else if (value instanceof Map) {
    const entries = []
    for (const [k, v] of value) entries.push(`${inspect(k, depth + 1, seen, maxDepth)} => ${inspect(v, depth + 1, seen, maxDepth)}`)
    res = entries.length === 0 ? 'Map(0) {}' : `Map(${value.size}) { ${entries.join(', ')} }`
  } else if (value instanceof Set) {
    const items = []
    for (const v of value) items.push(inspect(v, depth + 1, seen, maxDepth))
    res = items.length === 0 ? 'Set(0) {}' : `Set(${value.size}) { ${items.join(', ')} }`
  } else if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const items = Array.from(value, (v) => inspect(v, depth + 1, seen, maxDepth))
    res = `${value.constructor.name}(${value.length}) [ ${items.join(', ')} ]`
  } else {
    const prefix = Object.getPrototypeOf(value) === null ? '[Object: null prototype] ' : ''
    const parts = objectKeys(value).map((k) => `${keyDisplay(k)}: ${inspect(value[k], depth + 1, seen, maxDepth)}`)
    res = prefix + (parts.length === 0 ? '{}' : `{ ${parts.join(', ')} }`)
  }
  seen.pop()
  return res
}

/**
 * logger 格式化：无占位符，多参数空格拼接（string 原样 / 其它 inspect）
 * 第一个参数中的 % 字符原样输出（不支持占位符，项目内 0 使用）
 */
export function format(...args) {
  if (args.length === 0) return ''
  return args.map((a) => (typeof a === 'string' ? a : inspect(a, 0, [], MAX_DEPTH))).join(' ')
}
