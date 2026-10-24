// 浏览器端流式加解密内核（从 test/testAes.html 提取，算法与后端 flowEnc.js 逐字节一致）
// 依赖：window.md5（blueimp-md5 CDN）、WebCrypto、btoa/atob
// 红线：derivePwdKey/deriveAesKey/encryptAesChunk/encryptCha20Chunk 的算法参数不可改动，
//       否则与后端及 testAes.html 产出的密文不互通
export const MB = 1024 * 1024

// 辅助函数：ArrayBuffer 转 Hex 字符串
export function bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
}

export function hexToUint8Array(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
    }
    return bytes;
}

export function md5Utils(str) {
    return hexToUint8Array(globalThis.md5(str + ''))
}

// 读取 Blob 为 ArrayBuffer
export function readFileAsArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
    });
}

// 派生新密码 passwdOutward：密码 → PBKDF2(1000, salt) → hex
export async function derivePwdKey(password, saltCode = 'AES-CTR') {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );
    // 生成16字节数据。
    const keyLength = 16
    const passwdBit = await window.crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: enc.encode(saltCode),
            iterations: 1000,
            hash: "SHA-256"
        },
        keyMaterial,
        keyLength * 8
    );
    return bufferToHex(passwdBit)
}

// getAesKey：passwdOutward → md5(+sizeSalt) → AES-CTR key
export async function deriveAesKey(passwdOutward, sizeSalt) {
    const passkey = md5Utils(passwdOutward + sizeSalt)
    const aesctr = await crypto.subtle.importKey(
        "raw",                      // 格式：原始字节流
        passkey,                    // 数据：密码的字节数组
        { name: "AES-CTR", length: 128 },       // 算法：声明这个材料将用于 AES-CTR 算法
        false,                    // 不可导出：安全起见，不允许把这个中间材料再变回字节数组
        ["encrypt", "decrypt"]
    );
    return aesctr
}

// CTR counter 后 8 字节做 uint64 递增
export function incrementIV(counter, blocks) {
    const c = new Uint8Array(counter);
    let carry = blocks;
    for (let i = 15; i >= 8 && carry > 0; i--) {
        const sum = c[i] + carry;
        c[i] = sum & 0xff;
        carry = Math.floor(sum / 256)
    }
    if (carry > 0) throw new Error('CTR counter uint64 overflow')
    return c;
}

// 返回aes加密函数，确保startChunk是16倍数，这里加密或者解密都通一个函数
export async function encryptAesChunk(passwdOutward, fileSize) {
    const passkey = await deriveAesKey(passwdOutward, fileSize);
    const iv = md5Utils(fileSize + '')
    return async (startChunk, fileData) => {
        // 返回新的Uint8Array
        let nonce = new Uint8Array(iv)
        if (startChunk > 0) {
            // floor 防止精度问题，避免startChunk=32，出现increment=2.00000001或者1.99999999
            const increment = Math.floor((startChunk + 15) / 16)
            nonce = incrementIV(nonce, increment)
        }
        // 执行AES-CTR,其实加密或者解密都一样，计数器长度通常为 64 或 128
        const encryptedContent = await crypto.subtle.encrypt(
            { name: "AES-CTR", counter: nonce, length: 64 },
            passkey,
            fileData
        );
        return new Uint8Array(encryptedContent)
    }
}

export async function encryptCha20Chunk(passwdOutward, fileSize) {
    // 用于闭包，当对象用
    const passwdSalt = passwdOutward + fileSize
    const buf = new TextEncoder().encode(passwdSalt);
    const key = await crypto.subtle.digest("SHA-256", buf);
    const nonce = md5Utils(fileSize + '').slice(0, 12)
    // 创建对象
    const chacha = new ChaCha20(new Uint8Array(key), nonce)
    return async (startChunk, fileData) => {
        chacha.setPosition(startChunk)
        return chacha.update(new Uint8Array(fileData))
    }
}

// 创建可读流的实现方法，生成一个可读流用于输出文件
export function createReadableStream(encryptChunk, file, chunkSize, onProgress) {
    // 分块
    const CHUNK_SIZE = MB * chunkSize; // 字节必须要是16的倍数，因为处理position需要除以16
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    // 状态变量
    let chunkIndex = 0;
    const stream = new ReadableStream({
        async pull(controller) {
            try {
                if (chunkIndex >= totalChunks) {
                    controller.close();
                    onProgress(1);
                    return;
                }
                const start = chunkIndex * CHUNK_SIZE;
                // 读取最后一片数据
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunkBlob = file.slice(start, end);
                // 读取分片为 ArrayBuffer
                const chunkBuffer = await readFileAsArrayBuffer(chunkBlob);
                // 加密当前分片
                const encryptedChunk = await encryptChunk(start, chunkBuffer)
                // 将加密后的数据推入流
                controller.enqueue(encryptedChunk);
                chunkIndex++
                // 反馈进度
                onProgress(Math.min(start / file.size, 1));
            } catch (err) {
                controller.error(err);
                console.error(err);
            }
        }
    });
    return stream
}

// =========== chacha20算法代码实现 ===========
export class ChaCha20 {
    constructor(key, nonce, counter) {
        this.key = key
        this._constructor(this.key, nonce)
    }
    // counter = 0，this.counter 代表加密的块
    _constructor(key, nonce, counter = 1) {
        if (!(key instanceof Uint8Array) || key.length !== 32) {
            throw new Error('Key should be 32 byte array!')
        }

        if (!(nonce instanceof Uint8Array) || nonce.length !== 12) {
            throw new Error('Nonce should be 12 byte array!')
        }
        // key: 32字节 Uint8Array
        // nonce: 12字节 Uint8Array (RFC8439标准)
        this.skey = [...key]
        this.nonce = [...nonce]
        this.counter = counter
        this._bufPos = 0
        this._keystream = new Uint8Array(64)
    }

    _rotl(v, n) {
        return (v << n) | (v >>> (32 - n))
    }
    // 四分之一轮运算（核心）
    _qr(st, a, b, c, d) {
        st[a] = (st[a] + st[b]) >>> 0; st[d] = this._rotl(st[d] ^ st[a], 16)
        st[c] = (st[c] + st[d]) >>> 0; st[b] = this._rotl(st[b] ^ st[c], 12)
        st[a] = (st[a] + st[b]) >>> 0; st[d] = this._rotl(st[d] ^ st[a], 8)
        st[c] = (st[c] + st[d]) >>> 0; st[b] = this._rotl(st[b] ^ st[c], 7)
    }

    // 生成密钥流块
    _block() {
        // 先++ 方便计数
        const st = [
            0x61707865,
            0x3320646e,
            0x79622d32,
            0x6b206574, // 常量 "expand 32-byte k"
            ...this._bytesToUint32(this.skey), // 32字节key → 8个u32
            this.counter, // 计数器
            ...this._bytesToUint32(this.nonce), // 12字节nonce → 3个u32
        ]
        // 注意不能this.counter = this.counter++ >>> 0, error
        this.counter = (this.counter + 1) >>> 0
        if (this.counter == 0) {
            // 达到256G，调整once
            const bt = this._bytesToUint32(this.nonce)
            bt[2] = (bt[2] + 1) >>> 0
            this._uint32ToBytes(bt, this.nonce)
        }
        const x = [...st]
        // 20轮 = 10次双轮
        for (let i = 0; i < 10; i++) {
            this._qr(x, 0, 4, 8, 12)
            this._qr(x, 1, 5, 9, 13)
            this._qr(x, 2, 6, 10, 14)
            this._qr(x, 3, 7, 11, 15)
            this._qr(x, 0, 5, 10, 15)
            this._qr(x, 1, 6, 11, 12)
            this._qr(x, 2, 7, 8, 13)
            this._qr(x, 3, 4, 9, 14)
        }
        for (let i = 0; i < 16; i++) x[i] = (x[i] + st[i]) >>> 0
        this._uint32ToBytes(x, this._keystream)
        // 重置0
        this._bufPos = 0
        return this._keystream
    }

    // 加密/解密（异或运算，两者通用）
    update(data) {
        const out = new Uint8Array(data.length)
        let pos = 0
        while (pos < data.length) {
            const len = Math.min(64, data.length - pos)
            for (let i = 0; i < len; i++) {
                if (this._bufPos % 64 === 0) {
                    this._block()
                }
                out[pos + i] = data[pos + i] ^ this._keystream[this._bufPos++]
            }
            pos += len
        }
        return out
    }

    encrypt(messageBytes) {
        return this.update(messageBytes)
    }

    decrypt(messageBytes) {
        return this.update(messageBytes)
    }

    setPosition(position) {
        // 重置counter和_bufPos
        this.counter = Math.floor(position / 64) + 1
        // 空跑偏移量也可以
        this._bufPos = 0
        this.update(new Uint8Array(position % 64))
    }

    /**
     * 将 Uint8Array 转换为 Uint32Array (小端序) ，地位靠前
     * @param {buf} bytes
     * @returns {Uint32Array}
     */
    _bytesToUint32(buf) {
        const arr = new Uint32Array(buf.length / 4)
        for (let i = 0; i < arr.length; i++) {
            arr[i] = buf[i * 4] | (buf[i * 4 + 1] << 8) | (buf[i * 4 + 2] << 16) | (buf[i * 4 + 3] << 24)
        }
        return arr
    }

    _uint32ToBytes(u32, buf) {
        let pos
        for (let i = 0; i < u32.length; i++) {
            pos = i * 4
            buf[pos] = u32[i] & 0xff
            buf[pos + 1] = (u32[i] >>> 8) & 0xff
            buf[pos + 2] = (u32[i] >>> 16) & 0xff
            buf[pos + 3] = (u32[i] >>> 24) & 0xff
        }
    }
}

export function toBase64URL(uint8Array) {
    // 先转为标准 Base64
    let base64 = btoa(String.fromCharCode(...uint8Array));
    // 转为 URL 安全: + -> -, / -> _, 移除 =
    return base64
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export function fromBase64URL(base64URL) {
    // 还原为标准 Base64
    let base64 = base64URL
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    // 补充 padding
    while (base64.length % 4) {
        base64 += '=';
    }
    // 解析为 Uint8Array
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

export function crc32(buf, init = 0xffffffff) {
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

export async function encodeName(password, encType, plainName, codeType = 1) {
    if (/[ÃÂ�¤§½]/.test(plainName)) {
        return plainName
    }
    const nameBuf = new TextEncoder().encode(plainName)
    let encryptChunk = null
    let key = null
    if (encType === 'chacha20') {
        const passwdOutward = await derivePwdKey(password, 'CHA20')
        encryptChunk = await encryptCha20Chunk(passwdOutward, nameBuf.length)
        const passwdSalt = passwdOutward + nameBuf.length
        key = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passwdSalt));
    } else {
        const passwdOutward = await derivePwdKey(password, 'AES-CTR')
        encryptChunk = await encryptAesChunk(passwdOutward, nameBuf.length)
        key = md5Utils(passwdOutward + nameBuf.length)
    }
    const encNameBytes = await encryptChunk(0, nameBuf)
    const keyArr = new Uint8Array(key)
    // 转base64url或者是转cjk，加上MD5避免文件名产生可校验特征
    const crc32Val = crc32(new Uint8Array([...encNameBytes, ...keyArr]))
    // 把crc32写入4字节Buffer【小端】
    const crcBuf = numToUint8Array(crc32Val)
    // 合并原始字节+crc32，输出base64Url编码
    const combined = new Uint8Array([...encNameBytes, ...crcBuf])
    return toBase64URL(combined)
}

// 解密名字
const isBase64Code = /^[A-Za-z0-9\-_+~]+$/
const isCjkCode = /^[\u4e00-\u9fff]+$/

export async function decodeName(password, encType, encodeName) {
    // 判断字符是否正确
    let codeType = 0
    if (isBase64Code.test(encodeName)) {
        codeType = 1
    } else if (isCjkCode.test(encodeName)) {
        // 判断是否cjk的编码，则进行cjk解码
        codeType = 2
    } else {
        return 'orig_' + encodeName
    }
    // 选择base64url或者cjk进行解码
    const fullBuf = codeType === 2 ? cjkToBin(encodeName) : fromBase64URL(encodeName)
    // 开始解码，后4字节是CRC32校验码
    const encNameBytes = fullBuf.subarray(0, fullBuf.length - 4)
    const crc32Bytes = fullBuf.subarray(fullBuf.length - 4)

    let encryptChunk = null
    let key = null
    if (encType === 'chacha20') {
        const passwdOutward = await derivePwdKey(password, 'CHA20')
        encryptChunk = await encryptCha20Chunk(passwdOutward, encNameBytes.length)
        const passwdSalt = passwdOutward + encNameBytes.length
        key = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passwdSalt));
    } else {
        const passwdOutward = await derivePwdKey(password, 'AES-CTR')
        encryptChunk = await encryptAesChunk(passwdOutward, encNameBytes.length)
        key = md5Utils(passwdOutward + encNameBytes.length)
    }
    const keyArr = new Uint8Array(key)
    // 校验crc32，添加key混淆避免有特征
    const crc32Val = crc32(new Uint8Array([...encNameBytes, ...keyArr]))
    if (toUInt32LE(crc32Bytes) !== crc32Val) {
        // 校验失败，可能是原文件凑巧是base64url的字符串，或者是用户自己改乱了
        return 'orig_' + encodeName
    }
    // 校验通过开始解密
    const decNameByte = await encryptChunk(0, encNameBytes)
    // 如果用户在云盘手动创建文件例如：abcd123acb.txt, 依然有一定概率碰撞通过了crc32的校验通过，但如果不是乱码也允许显示
    const decodeStr = new TextDecoder().decode(decNameByte)
    if (/[ÃÂ�¤§½]/.test(decodeStr)) {
        return 'orig_' + encodeName
    }
    return decodeStr
}

// 32位数字转array
export function numToUint8Array(num, littleEndian = true) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, num, littleEndian);
    return new Uint8Array(buffer);
}

export function toUInt32LE(bytes) {
    // 避免负数
    return (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
}

// -------------- CJK 编码（14bit/字）--------------------
const CJK_BASE = 0x4e00
const BITS_PER_CHAR = 14

export function binToCjk(buf) {
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
        // 添加最后剩余的几位bit
        chars.push(String.fromCodePoint(CJK_BASE + val))
    }
    // 标记剩余bit数量：0~13，有可能刚好0
    chars.push(String.fromCodePoint(CJK_BASE + remainBits))
    return chars.join('')
}

export function cjkToBin(cjkStr) {
    const codePoints = [...cjkStr].map((c) => c.codePointAt(0))
    const bits = []
    let tailBits = 0
    // 判断尾部标记
    if (codePoints.length >= 2) {
        const marker = codePoints.at(-1) - CJK_BASE
        // marker 一定小于14，不然则说明非法的字符集
        tailBits = marker
        codePoints.pop()
        if (marker > 13) {
            throw new Error('非法cjk字符集！')
        }
    }

    for (let i = 0; i < codePoints.length; i++) {
        const offset = codePoints[i] - CJK_BASE
        let take = BITS_PER_CHAR
        // 如果大于0则说明最后一个字符是溢出的
        if (tailBits > 0 && i === codePoints.length - 1) {
            take = tailBits
        }
        for (let b = take - 1; b >= 0; b--) {
            bits.push((offset >> b) & 1)
        }
    }
    // 高位转回低位
    const out = []
    for (let i = 0; i < bits.length; i += 8) {
        let byte = 0
        for (let j = 0; j < 8; j++) {
            if (i + j >= bits.length) break
            byte = (byte << 1) | bits[i + j]
        }
        out.push(byte)
    }
    return new Uint8Array(out)
}
