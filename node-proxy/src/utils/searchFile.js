import fs from 'fs'

function readDirSync(filePath) {
  const fileArray = []
  const files = fs.readdirSync(filePath)
  files.forEach(function (ele, index) {
    const info = fs.statSync(filePath + '/' + ele)
    if (info.isDirectory()) {
      //   console.log('dir: ' + ele)
      const deepArr = readDirSync(filePath + '/' + ele)
      fileArray.push(...deepArr)
    } else {
      const data = { size: info.size, filePath: filePath + '/' + ele }
      fileArray.push(data)
    }
  })
  return fileArray
}

export default readDirSync
