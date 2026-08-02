// "Class" for calculating CRC8 checksums...
function CRCn(num, polynomial, initialValue = 0) {
  // constructor takes an optional polynomial type from CRC8.POLY
  polynomial = polynomial || CRCn.POLY8.CRC8_DALLAS_MAXIM
  if (num === 6) {
    this.table = CRCn.generateTable6()
  }
  if (num === 8) {
    this.table = CRCn.generateTable8MAXIM(polynomial)
  }
  this.initialValue = initialValue
}

// Returns the 8-bit checksum given an array of byte-sized numbers
CRCn.prototype.checksum = function (byteArray) {
  let c = this.initialValue
  for (let i = 0; i < byteArray.length; i++) {
    c = this.table[(c ^ byteArray[i]) % 256]
  }
  return c
}

// returns a lookup table byte array given one of the values from CRC8.POLY
CRCn.generateTable8 = function (polynomial) {
  const csTable = [] // 256 max len byte array
  for (let i = 0; i < 256; ++i) {
    let curr = i
    for (let j = 0; j < 8; ++j) {
      if ((curr & 0x80) !== 0) {
        curr = ((curr << 1) ^ polynomial) % 256
      } else {
        curr = (curr << 1) % 256
      }
    }
    csTable[i] = curr
  }
  return csTable
}
/**
 * CRC8 CCITT (0x07)
 * @param {string|Buffer} data
 * @returns {number} 0~0xFF
 */
function crc8(data) {
  if (typeof data === 'string') {
    data = Buffer.from(data, 'utf8');
  }
  const POLY = 0x07;
  let crc = 0x00;

  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x80) {
        crc = ((crc << 1) ^ POLY) & 0xFF;
      } else {
        crc = (crc << 1) & 0xFF;
      }
    }
  }
  return crc & 0xFF;
}



// CRC8_DALLAS_MAXIM，跟上面的比较的话，不需要输入和输出的反转
CRCn.generateTable8MAXIM = function (polynomial) {
  const csTable = [] // 256 max len byte array
  for (let i = 0; i < 256; ++i) {
    let curr = i
    for (let j = 0; j < 8; ++j) {
      if ((curr & 0x01) !== 0) {
        // 0x31=>00110001 翻转 10001100=>0x8C
        curr = ((curr >> 1) ^ 0x8c) % 256
      } else {
        curr = (curr >> 1) % 256
      }
    }
    csTable[i] = curr
  }
  return csTable
}

// 已经完成了输入和输出的反转，所以输入和输出就不需要单独反转
CRCn.generateTable6 = function () {
  const csTable = [] // 256 max len byte array
  for (let i = 0; i < 256; i++) {
    let curr = i
    for (let j = 0; j < 8; ++j) {
      if ((curr & 0x01) !== 0) {
        // 0x03(多项式：x6+x+1，00100011)，最高位不需要异或，直接去掉 0000 0011
        // 0x30 = (reverse 0x03)>>(8-6) = 00110000
        curr = ((curr >> 1) ^ 0x30) % 256
      } else {
        curr = (curr >> 1) % 256
      }
    }
    csTable[i] = curr
  }
  return csTable
}

function crc16(data) {
  if (typeof data === 'string') {
    data = Buffer.from(data, 'utf8');
  }
  const POLY = 0x1021;
  let crc = 0x0000;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ POLY;
      } else {
        crc <<= 1;
      }
      crc &= 0xFFFF; // 保持16位
    }
  }
  return crc;
}

// This "enum" can be used to indicate what kind of CRC8 checksum you will be calculating
CRCn.POLY8 = {
  CRC8: 0xd5,
  CRC8_CCITT: 0x07,
  CRC8_DALLAS_MAXIM: 0x31,
  CRC8_SAE_J1850: 0x1d,
  CRC_8_WCDMA: 0x9b,
}

export default CRCn
