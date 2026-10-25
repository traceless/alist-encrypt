/**
 * S1d: node:crypto createCipheriv('aes-128-ctr') 原生基线（现网生产路径）
 * 仅 Node 运行：node bench/node-cipher-baseline.mjs
 */
'use strict'
import crypto from 'node:crypto'
import { Transform, Writable, Readable, pipeline } from 'node:stream'
import { promisify } from 'node:util'
import { performance } from 'node:perf_hooks'

const pipelineAsync = promisify(pipeline)
const devnull = () =>
  new Writable({
    write(_chunk, _enc, cb) {
      cb()
    },
  })

const key = crypto.createHash('md5').update('salt').digest()
const iv = crypto.createHash('md5').update('sizesalt').digest()

function cipherTransform() {
  const c = crypto.createCipheriv('aes-128-ctr', key, iv)
  return new Transform({
    transform(chunk, _enc, next) {
      next(null, c.update(chunk))
    },
  })
}

async function bench(totalMB, blockSize) {
  const data = crypto.randomBytes(blockSize)
  let pushed = 0
  const t0 = performance.now()
  await pipelineAsync(
    Readable.from(function* () {
      while (pushed < totalMB * 1024 * 1024) {
        yield data
        pushed += blockSize
      }
    }()),
    cipherTransform(),
    devnull(),
  )
  const ms = performance.now() - t0
  return ((totalMB * 1024 * 1024) / (ms / 1000) / (1024 * 1024)).toFixed(1)
}

console.log('=== node:crypto createCipheriv baseline (生产路径) ===')
console.log(`64KB blocks 256MB: ${await bench(256, 64 * 1024)} MB/s`)
console.log(`4KB  blocks  64MB: ${await bench(64, 4096)} MB/s`)
