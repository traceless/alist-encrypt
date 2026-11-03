/**
 * tjs 最小 Buffer shim（P2）—— 由 tjs-server.js 注入 globalThis.Buffer
 *
 * node 端不加载本模块（原生 Buffer，行为零变化）。
 * P2 范围：业务透传/改写路径的 byteLength（appFactory alist 兜底、encDavHandle respondRaw、
 * encNameRouter rename）+ 常用静态方法/toString 的基础实现。
 * 完整 TypedArray 语义与名称加解密链路（mixBase64/crcn 等）由 P3 统一分发替换。
 */
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

class TjsBuffer extends Uint8Array {
  static byteLength(str, encoding = 'utf8') {
    if (typeof str !== 'string') {
      return str.byteLength ?? str.length ?? 0
    }
    if (encoding === 'utf8' || encoding === 'utf-8' || encoding === 'ascii' || encoding === 'latin1' || encoding === 'binary') {
      return textEncoder.encode(str).byteLength
    }
    if (encoding === 'hex') {
      return Math.ceil(str.length / 2)
    }
    if (encoding === 'base64' || encoding === 'base64url') {
      let len = Math.floor((str.replace(/=+$/, '').length * 3) / 4)
      // 补齐末尾未填满的组
      const rem = str.replace(/=+$/, '').length % 4
      if (encoding !== 'base64url' && rem === 3) len += 1
      return len
    }
    return textEncoder.encode(str).byteLength
  }

  static from(input, encoding = 'utf8') {
    if (typeof input === 'string') {
      if (encoding === 'hex') {
        const out = new TjsBuffer(Math.floor(input.length / 2))
        for (let i = 0; i < out.length; i++) {
          out[i] = parseInt(input.substr(i * 2, 2), 16)
        }
        return out
      }
      if (encoding === 'base64' || encoding === 'base64url') {
        const norm = encoding === 'base64url' ? input.replace(/-/g, '+').replace(/_/g, '/') : input
        return new TjsBuffer(base64Decode(norm))
      }
      return new TjsBuffer(textEncoder.encode(input))
    }
    if (input instanceof ArrayBuffer) {
      return new TjsBuffer(new Uint8Array(input.slice(0)))
    }
    if (ArrayBuffer.isView(input)) {
      // node 语义：from(TypedArray) 拷贝内容
      return new TjsBuffer(new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)))
    }
    if (Array.isArray(input) || (input && typeof input[Symbol.iterator] === 'function')) {
      return new TjsBuffer([...input])
    }
    throw new TypeError('Buffer.from: invalid input')
  }

  static alloc(size, fill = 0) {
    const buf = new TjsBuffer(size)
    if (size > 0) {
      if (typeof fill === 'number') {
        buf.fill(fill)
      } else if (typeof fill === 'string') {
        const f = textEncoder.encode(fill)
        for (let i = 0; i < size; i += f.byteLength) {
          buf.set(f.subarray(0, Math.min(f.byteLength, size - i)), i)
        }
      } else if (ArrayBuffer.isView(fill)) {
        const f = new Uint8Array(fill.buffer, fill.byteOffset, fill.byteLength)
        for (let i = 0; i < size; i += f.byteLength) {
          buf.set(f.subarray(0, Math.min(f.byteLength, size - i)), i)
        }
      }
    }
    return buf
  }

  static concat(list, totalLength) {
    const total = totalLength ?? list.reduce((n, item) => n + item.byteLength, 0)
    const out = new TjsBuffer(total)
    let offset = 0
    for (const item of list) {
      if (offset >= total) break
      out.set(new Uint8Array(item.buffer ?? item, item.byteOffset ?? 0, Math.min(item.byteLength, total - offset)), offset)
      offset += item.byteLength
    }
    return out
  }

  static isBuffer(x) {
    return x instanceof TjsBuffer
  }

  toString(encoding = 'utf8') {
    const bytes = new Uint8Array(this.buffer, this.byteOffset, this.byteLength)
    if (encoding === 'utf8' || encoding === 'utf-8' || encoding === 'ascii') {
      return textDecoder.decode(bytes)
    }
    if (encoding === 'hex') {
      return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
    }
    if (encoding === 'base64' || encoding === 'base64url') {
      const b64 = base64Encode(bytes)
      return encoding === 'base64url' ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64
    }
    return textDecoder.decode(bytes)
  }
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64Encode(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += B64_ALPHABET[b0 >> 2]
    out += B64_ALPHABET[((b0 & 3) << 4) | (b1 >> 4)]
    out += i + 1 < bytes.length ? B64_ALPHABET[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += i + 2 < bytes.length ? B64_ALPHABET[b2 & 63] : '='
  }
  return out
}

function base64Decode(str) {
  const clean = str.replace(/[^A-Za-z0-9+/]/g, '')
  const out = []
  let buffer = 0
  let bits = 0
  for (const ch of clean) {
    buffer = (buffer << 6) | B64_ALPHABET.indexOf(ch)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buffer >> bits) & 0xff)
    }
  }
  return new Uint8Array(out)
}

export const bufferShim = TjsBuffer
