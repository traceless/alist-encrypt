/**
 * CRC6 ITU 标准实现（逐bit通用写法）
 * @param {Buffer|string} data
 * @returns {number} 0~63
 */
function crc6(data) {
  if (typeof data === 'string') {
    data = Buffer.from(data, 'utf8')
  }
  const POLY = 0x03
  let crc = 0x00
  for (const byte of data) {
    let b = byte
    // 遍历单个字节8 bit
    for (let bit = 7; bit >= 0; bit--) {
      const inBit = (b >> bit) & 1
      const msb = (crc >> 5) & 1 // 6bit最高位
      crc = ((crc << 1) | inBit) & 0x3f
      if (msb) {
        crc ^= POLY
      }
    }
  }
  return crc & 0x3f
}

/**
 * CRC8 CCITT (0x07)
 * @param {string|Buffer} data
 * @returns {number} 0~0xFF
 */
function crc8(data) {
  if (typeof data === 'string') {
    data = Buffer.from(data, 'utf8')
  }
  const POLY = 0x07
  let crc = 0x00

  for (const byte of data) {
    crc ^= byte
    for (let i = 0; i < 8; i++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ POLY) & 0xff
      } else {
        crc = (crc << 1) & 0xff
      }
    }
  }
  return crc & 0xff
}

/**
 * CRC16 XMODEM
 * https://www.ip33.com/crc.html
 * @param {string|Buffer} data 输入utf8字符串或Buffer
 * @returns {number} 0 ~ 0xFFFF
 */
function crc16(data) {
  if (typeof data === 'string') {
    data = Buffer.from(data, 'utf8')
  }
  const POLY = 0x1021
  let crc = 0x0000
  for (const byte of data) {
    crc ^= byte << 8
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ POLY
      } else {
        crc <<= 1
      }
      crc &= 0xffff // 保持16位
    }
  }
  return crc
}
/**
 * CRC32 IEEE (标准CRC32)
 * @param {Uint8Array} buf 二进制数据
 * @param {number} init 初始值，流式计算使用
 * @returns {number} uint32 无符号整数
 */
function crc32(buf, init = 0xffffffff) {
  // 预生成表（全局只初始化一次）
  if (!crc32.table) {
    const table = new Uint32Array(256)
    for (let i = 0; i < 256; i++) {
      let crc = i
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
      }
      table[i] = crc >>> 0
    }
    crc32.table = table
  }
  let crc = init >>> 0
  const tbl = crc32.table
  for (const byte of buf) {
    crc = (crc >>> 8) ^ tbl[(crc ^ byte) & 0xff]
  }
  // 最终异或输出
  return (crc ^ 0xffffffff) >>> 0
}

export { crc6, crc8, crc16, crc32 }
