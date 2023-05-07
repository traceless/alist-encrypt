'use strict'
import fs from 'fs'
import path from 'path'

import mkdirp from 'mkdirp'
import FlowEnc from './flowEnc.js'
import { encodeName, decodeName } from './commonUtil.js'

export function searchFile(filePath) {
  const fileArray = []
  const files = fs.readdirSync(filePath)
  files.forEach(function (ele, index) {
    const info = fs.statSync(filePath + '/' + ele)
    if (info.isDirectory()) {
      //   console.log('dir: ' + ele)
      const deepArr = searchFile(filePath + '/' + ele)
      fileArray.push(...deepArr)
    } else {
      const data = { size: info.size, filePath: filePath + '/' + ele }
      fileArray.push(data)
    }
  })
  return fileArray
}

// encrypt
export async function encryptFile(password, encType, enc, encPath, outPath, encName) {
  const start = Date.now()
  const interval = setInterval(() => {
    console.log(new Date(), 'waiting finish!!!')
  }, 2000)
  if (!path.isAbsolute(encPath)) {
    encPath = path.join(process.cwd(), encPath)
  }
  outPath = outPath || process.cwd() + '/outFile/' + Date.now()
  console.log('you input:', password, encType, enc, encPath)
  if (!fs.existsSync(encPath)) {
    console.log('you input filePath is not exists ')
    return
  }
  // init outpath dir
  if (!fs.existsSync(outPath)) {
    mkdirp.sync(outPath)
  }
  // input file path
  const allFilePath = searchFile(encPath)
  const tempDir = encPath + '/.temp'
  if (!fs.existsSync(tempDir)) {
    mkdirp.sync(tempDir)
  }
  let promiseArr = []
  for (const fileInfo of allFilePath) {
    const { filePath, size } = fileInfo
    let relativePath = filePath.replace(encPath, '')
    const fileName = path.basename(relativePath)
    const ext = path.extname(relativePath)
    if (enc === 'enc' && encName) {
      const newFileName = encodeName(password, encType, fileName) + ext
      relativePath = relativePath.replace(fileName, newFileName)
    }
    if (enc === 'dec') {
      const newFileName = decodeName(password, encType, fileName.replace(ext, ''))
      if (newFileName) {
        relativePath = relativePath.replace(fileName, newFileName)
      }
    }
    const outFilePath = outPath + relativePath
    const outFilePathTemp = tempDir + relativePath
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
    const promise = new Promise((resolve, reject) => {
      readStream.pipe(enc === 'enc' ? flowEnc.encryptTransform() : flowEnc.decryptTransform()).pipe(writeStream)
      readStream.on('end', () => {
        console.log('@@finish filePath', filePath, outFilePathTemp)
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
  console.log('@@all finish', ((Date.now() - start) / 1000).toFixed(2) + 's')
  clearInterval(interval)
}

export function convertFile() {
  const statTime = Date.now()
  const arg = process.argv.slice(2)
  // check finish
  if (arg.length > 3) {
    encryptFile(...arg).then(() => {
      console.log('all file finish enc!!! time:', Date.now() - statTime)
    })
  } else {
    console.log('input error， example param:nodejs-linux passwd12345 rc4 enc ./myfolder /tmp/outPath encname  ')
  }
}
