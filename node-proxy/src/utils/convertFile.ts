import fs from 'fs'
import path from 'path'

import mkdirp from 'mkdirp'
import FlowEnc from './flowEnc'
import { logger } from '@/common/logger'
import { encodeName, decodeName } from './cryptoUtil'

//找出文件夹下的文件
export function searchFile(filePath: string) {
  const fileArray: { size: number; filePath: string }[] = []
  const files = fs.readdirSync(filePath)
  files.forEach((child) => {
    const filePath2 = path.join(filePath, child),
      info = fs.statSync(filePath2)
    if (info.isDirectory()) {
      const deepArr = searchFile(filePath2)
      fileArray.push(...deepArr)
    } else {
      const data = { size: info.size, filePath: filePath2 }
      fileArray.push(data)
    }
  })
  return fileArray
}

// 加密文件夹下的全部文件
export async function encryptFile(
  password: string,
  encType: EncryptType,
  enc: 'enc' | 'dec',
  encPath: string,
  outPath?: string,
  encName?: boolean | string
) {
  const start = Date.now()
  const interval = setInterval(() => {
    logger.warn(new Date(), 'waiting finish!!!')
  }, 2000)
  if (!path.isAbsolute(encPath)) {
    encPath = path.join(process.cwd(), encPath)
  }
  outPath = outPath || path.join(process.cwd(), 'outFile', Date.now().toString())
  logger.info('文件加密配置: ', password, encType, enc, encPath)
  if (!fs.existsSync(encPath)) {
    logger.warn('文件夹不存在！')
    return
  }
  // init outPath dir
  if (!fs.existsSync(outPath)) {
    mkdirp.sync(outPath)
  }
  // input file path
  const allFilePath = searchFile(encPath)
  const tempDir = path.join(outPath, '.temp')
  if (!fs.existsSync(tempDir)) {
    mkdirp.sync(tempDir)
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
    mkdirp.sync(path.dirname(outFilePathTemp))
    mkdirp.sync(path.dirname(outFilePath))
    // 开始加密
    if (size === 0) {
      continue
    }
    const flowEnc = new FlowEnc(password, encType, size)
    // console.log('@@outFilePath', outFilePath, encType, size)
    const writeStream = fs.createWriteStream(outFilePathTemp)
    const readStream = fs.createReadStream(filePath)
    const promise = new Promise<void>((resolve) => {
      readStream.pipe(enc === 'enc' ? flowEnc.encryptTransform() : flowEnc.decryptTransform()).pipe(writeStream)
      readStream.on('end', () => {
        logger.info(`加密完成: ${filePath} -> ${outFilePathTemp}`)
        fs.renameSync(outFilePathTemp, outFilePath)
        resolve()
      })
    })
    promiseArr.push(promise)
    if (promiseArr.length > 50) {
      await Promise.all(promiseArr)
      promiseArr = []
    }
  }
  await Promise.all(promiseArr)
  fs.rmSync(tempDir, { recursive: true })
  logger.info('全部文件加密完成', ((Date.now() - start) / 1000).toFixed(2) + 's')
  clearInterval(interval)
}

export function convertFile(
  ...args: [password: string, encType: EncryptType, enc: 'enc' | 'dec', encPath: string, outPath?: string, encName?: string]
) {
  const statTime = Date.now()
  if (args.length > 3) {
    encryptFile(...args).then(() => {
      logger.info('all file finish enc!!! time:', Date.now() - statTime)
      process.exit(0)
    })
  } else {
    console.error('input error， example param:nodejs-linux passwd12345 rc4 enc ./myFolder /tmp/outPath encName  ')
    process.exit(1)
  }
}
