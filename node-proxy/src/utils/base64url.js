/**
 * RFC4648 标准 Base64 字符表
 */
const BASE64_TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_URL_TABLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
const PAD_CHAR = '='

/**
 * 二进制 Uint8Array → Base64 字符串
 * @param {Uint8Array} data 原始二进制
 * @returns {string} base64字符串
 */
function encode(bufData, charTabel = BASE64_TABLE) {
  const buffer = bufData instanceof Buffer ? bufData : Buffer.from(bufData, 'utf8')
  const data = new Uint8Array(buffer)

  const output = []
  let idx = 0
  const len = data.length
  while (idx < len) {
    // 取三个字节一组
    const b1 = data[idx++]
    const b2 = data[idx++] ?? 0
    const b3 = data[idx++] ?? 0
    // 24bit 拼接
    const twentyFour = (b1 << 16) | (b2 << 8) | b3
    // 拆4个6bit
    const c1 = (twentyFour >> 18) & 0x3f
    const c2 = (twentyFour >> 12) & 0x3f
    const c3 = (twentyFour >> 6) & 0x3f
    const c4 = twentyFour & 0x3f
    // 添加
    output.push(charTabel[c1])
    output.push(charTabel[c2])
    // 假设len=2个字节，b3是0，idx=3, 则添加C3，不添加C4
    if (idx - 2 < len) output.push(charTabel[c3])
    if (idx - 1 < len) output.push(charTabel[c4])
  }
  // 添加填充
  const padCount = (3 - (len % 3)) % 3
  output.push('='.repeat(padCount))
  return output.join('')
}

/**
 * Base64字符串 → Uint8Array 二进制
 * @param {string} str base64字符串
 * @returns {Uint8Array} 原始二进制
 */
function decode(str, charTabel = BASE64_TABLE) {
  // 自动补齐填充（兼容不带=的Base64URL）
  // const padNeeded = (4 - (str.length % 4)) % 4
  // 统计末尾填充符
  while (str.endsWith(PAD_CHAR)) {
    // padCount++
    str = str.slice(0, -1)
  }
  const map = new Map()
  for (let idx = 0; idx < charTabel.length; idx++) {
    map.set(charTabel[idx], idx)
  }
  const result = []
  let i = 0
  const len = str.length
  while (i < len) {
    // 直接拼接4个字符，转三个字节的
    const v1 = map.get(str[i++])
    const v2 = map.get(str[i++])
    const v3 = map.get(str[i++]) ?? 0
    const v4 = map.get(str[i++]) ?? 0
    // 对应的三个字节
    const b1 = (v1 << 2) | (v2 >> 4)
    const b2 = ((v2 & 0x0f) << 4) | (v3 >> 2)
    const b3 = ((v3 & 0x03) << 6) | v4
    result.push(b1)
    // 如果base64是3个字符，对应就是2个字节，4 - 2 < 3
    if (i - 2 < len) result.push(b2)
    if (i - 1 < len) result.push(b3)
  }
  return Buffer.from(result)
}

// base64url
function encode4Url(data) {
  let code = encode(data, BASE64_URL_TABLE)
  while (code.endsWith(PAD_CHAR)) {
    code = code.slice(0, -1)
  }
  return code
}

function decode4Url(data) {
  return decode(data, BASE64_URL_TABLE)
}

const base64 = { encode, decode, encode4Url, decode4Url }
export default base64
