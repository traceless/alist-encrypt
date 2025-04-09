// "Class" for calculating CRC8 checksums...
class CRCn {
  private readonly table: number[]
  private readonly initialValue: number

  constructor(num: number, initialValue = 0) {
    // constructor takes an optional polynomial type from CRC8.POLY
    if (num === 6) {
      this.table = CRCn.generateTable6()
    }
    if (num === 8) {
      this.table = CRCn.generateTable8MAXIM()
    }
    this.initialValue = initialValue
  }

  // CRC8_DALLAS_MAXIM，跟上面的比较的话，不需要输入和输出的反转
  static generateTable8MAXIM(): number[] {
    const csTable: number[] = [] // 256 max len byte array
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
  static generateTable6(): number[] {
    const csTable: number[] = [] // 256 max len byte array
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

  // Returns the 8-bit checksum given an array of byte-sized numbers
  checksum(byteArray: Buffer): number {
    let c = this.initialValue
    for (let i = 0; i < byteArray.length; i++) {
      c = this.table[(c ^ byteArray[i]) % 256]
    }
    return c
  }
}

export default CRCn
