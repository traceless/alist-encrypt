import crypto from 'crypto'
import path from 'path'

import ChaCha20 from './src/utils/chaCha20.js'
import ChaCha20Poly from './src/utils/chaCha20Poly.js'
import { chownSync, copyFileSync } from 'fs'
import nedb from './src/utils/nedb.js'

// "Class" for calculating CRC8 checksums...
function CRC8(polynomial, initialValue) {
  // constructor takes an optional polynomial type from CRC8.POLY
  if (polynomial == null) polynomial = CRC8.POLY.CRC8_CCITT
  this.table = CRC8.generateTable(polynomial)
  this.initial_value = initialValue
}

// Returns the 8-bit checksum given an array of byte-sized numbers
CRC8.prototype.checksum = function (byteArray) {
  var c = this.initial_value

  for (var i = 0; i < byteArray.length; i++) {
    c = this.table[(c ^ byteArray[i]) % 256]
  }

  return c
}

// returns a lookup table byte array given one of the values from CRC8.POLY
CRC8.generateTable = function (polynomial) {
  var csTable = [] // 256 max len byte array

  for (var i = 0; i < 256; ++i) {
    var curr = i
    for (var j = 0; j < 8; ++j) {
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

// This "enum" can be used to indicate what kind of CRC8 checksum you will be calculating
CRC8.POLY = {
  CRC8: 0xd5,
  CRC8_CCITT: 0x07,
  CRC8_DALLAS_MAXIM: 0x31,
  CRC8_SAE_J1850: 0x1d,
  CRC_8_WCDMA: 0x9b,
}
var sample_text = 'Hi. I need a checksum.'

// convert sample text to array of bytes
var byte_array = sample_text.split('').map(function (x) {
  return x.charCodeAt(0)
})

var crc8 = new CRC8()

var checksum = crc8.checksum(byte_array)
console.log(checksum & 0xff)
