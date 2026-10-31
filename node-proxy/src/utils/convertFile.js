'use strict'
import fs from 'fs'
import path from 'path'

import FlowEnc from './flowEnc.js'
import { encodeName, decodeName } from './commonUtil.js'
import { logger } from '../common/logger.js'
import * as fsx from '../runtime/fsx.js'

// 异步递归扫描目录，不阻塞事件循环（原 readdirSync/statSync 全同步版在万级文件时会卡住整个代理）
export async function searchFile(filePath) {
  const fileArray = []
  const files = await fsx.readdir(filePath)
  for (const child of files) {
    const filePath2 = path.join(filePath, child)
    const info = await fsx.stat(filePath2)
    if (info.isDirectory()) {
      const deepArr = await searchFile(filePath2)
      fileArray.push(...deepArr)
    } else {
      const data = { size: info.size, filePath: filePath2 }
      fileArray.push(data)
    }
  }
  return fileArray
}

// encrypt
export async function encryptFile(password, encType, enc, encPath, outPath, encName, preScanned) {
  const start = Date.now()
  const timer = setInterval(() => {
    logger.info('@@encryptFile waiting finish...', ((Date.now() - start) / 1000).toFixed(0) + 's')
  }, 2000)
  if (!path.isAbsolute(encPath)) {
    encPath = path.join(process.cwd(), encPath)
  }
  outPath = outPath || path.join(process.cwd(), 'outFile', Date.now().toString())
  logger.info('@@encryptFile input:', encType, enc, encPath, '->', outPath)
  if (!(await fsx.exists(encPath))) {
    logger.error('@@encryptFile you input filePath is not exists ', encPath)
    clearInterval(timer)
    return
  }
  // 双扫消除：router 已扫描则复用结果；CLI 直调时自行扫描
  const allFilePath = preScanned || (await searchFile(encPath))
  // init outpath dir
  await fsx.mkdir(outPath, { recursive: true })
  const tempDir = path.join(outPath, '.temp')
  await fsx.mkdir(tempDir, { recursive: true })
  // 同目录只创建一次，避免万级文件时反复 mkdir
  const ensuredDirs = new Set([tempDir, outPath])
  const ensureDir = async (dir) => {
    if (ensuredDirs.has(dir)) {
      return
    }
    await fsx.mkdir(dir, { recursive: true })
    ensuredDirs.add(dir)
  }
  let promiseArr = []
  for (const fileInfo of allFilePath) {
    const { filePath, size } = fileInfo
    let relativePath = filePath.substring(encPath.length)
    const fileName = path.basename(relativePath),
      ext = path.extname(relativePath),
      childPath = path.dirname(relativePath)
    if (enc === 'enc' && encName) {
      const newFileName = encodeName(password, encType, fileName) + ext
      relativePath = path.join(childPath, newFileName)
    }
    if (enc === 'dec' && encName) {
      const newFileName = decodeName(password, encType, ext !== '' ? fileName.substring(0, fileName.length - ext.length) : fileName)
      if (newFileName) {
        relativePath = path.join(childPath, newFileName)
      }
    }
    const outFilePath = path.join(outPath, relativePath)
    const outFilePathTemp = path.join(tempDir, relativePath)
    await ensureDir(path.dirname(outFilePathTemp))
    await ensureDir(path.dirname(outFilePath))
    // 开始加密
    if (size === 0) {
      continue
    }
    const flowEnc = new FlowEnc(password, encType, size)
    const writeStream = fs.createWriteStream(outFilePathTemp)
    const readStream = fs.createReadStream(filePath)
    const promise = new Promise((resolve, reject) => {
      readStream.pipe(enc === 'enc' ? flowEnc.encryptTransform() : flowEnc.decryptTransform()).pipe(writeStream)
      readStream.on('end', () => {
        logger.debug('@@finish filePath', filePath, outFilePathTemp)
        fsx.rename(outFilePathTemp, outFilePath).then(resolve, reject)
      })
      // 原版无错误监听：流失败会变成 unhandled error 事件直接打崩进程
      readStream.on('error', reject)
      writeStream.on('error', reject)
    })
    promiseArr.push(promise)
    if (promiseArr.length > 50) {
      await Promise.all(promiseArr)
      promiseArr = []
    }
  }
  await Promise.all(promiseArr)
  await fsx.rm(tempDir, { recursive: true })
  logger.info('@@encryptFile all finish', ((Date.now() - start) / 1000).toFixed(2) + 's', allFilePath.length + ' files')
  clearInterval(timer)
}

export function convertFile(...args) {
  const statTime = Date.now()
  if (args.length > 3) {
    encryptFile(...args)
      .then(() => {
        console.log('all file finish enc!!! time:', Date.now() - statTime)
        process.exit(0)
      })
      .catch((err) => {
        console.error('encryptFile error:', err)
        process.exit(1)
      })
  } else {
    console.error('input error， example param:nodejs-linux passwd12345 rc4 enc ./myfolder /tmp/outPath encname  ')
    process.exit(1)
  }
}
