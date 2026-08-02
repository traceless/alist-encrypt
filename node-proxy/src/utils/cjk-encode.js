/**
 * Binary <-> CJK汉字映射
 * 区间 U+4E00 ~ U+9FFF (0x4E00 ~ 0x9FFF)
 * 每个汉字承载 14 bit
 */
const CJK_BASE = 0x4e00
const CJK_MAX_OFFSET = 0x9fff - 0x4e00 // 20991
const BITS_PER_CHAR = 14
const MAX_VALUE = (1 << BITS_PER_CHAR) - 1 // 16383

/**
 * Buffer 转 CJK汉字字符串（14bit/字，无溢出）
 * @param {Buffer} buf
 * @returns {string}
 */
function binToCjk(buf) {
  const bits = []
  // 把所有字节展开为bit数组，高位在前
  for (const byte of buf) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >> i) & 1)
    }
  }

  const chars = []
  let ptr = 0
  // 完整14bit组
  while (ptr + BITS_PER_CHAR <= bits.length) {
    let val = 0
    for (let i = 0; i < BITS_PER_CHAR; i++) {
      val = (val << 1) | bits[ptr++]
    }
    chars.push(String.fromCodePoint(CJK_BASE + val))
  }

  const remainBits = bits.length - ptr
  if (remainBits > 0) {
    let val = 0
    for (let i = 0; i < remainBits; i++) {
      val = (val << 1) | bits[ptr++]
    }
    chars.push(String.fromCodePoint(CJK_BASE + val))
    // 标记剩余bit数量：1~13
    chars.push(String.fromCodePoint(CJK_BASE + remainBits))
  }
  return chars.join('')
}

/**
 * CJK字符串还原Buffer
 * @param {string} cjkStr
 * @returns {Buffer}
 */
function cjkToBin(cjkStr) {
  const codePoints = [...cjkStr].map((c) => c.codePointAt(0))
  const bits = []
  let tailBits = 0

  // 判断尾部标记
  if (codePoints.length >= 2) {
    const marker = codePoints.at(-1) - CJK_BASE
    if (marker >= 1 && marker <= 13) {
      tailBits = marker
      codePoints.pop()
    }
  }

  for (let i = 0; i < codePoints.length; i++) {
    const offset = codePoints[i] - CJK_BASE
    let take = BITS_PER_CHAR
    if (tailBits > 0 && i === codePoints.length - 1) {
      take = tailBits
    }
    for (let b = take - 1; b >= 0; b--) {
      bits.push((offset >> b) & 1)
    }
  }
  const out = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) {
      if (i + j >= bits.length) break
      byte = (byte << 1) | bits[i + j]
    }
    out.push(byte)
  }
  return Buffer.from(out)
}

export { binToCjk, cjkToBin }
