import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import os from 'os'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { randomUUID } from 'crypto'
dotenv.config('./env')

// ncc will take this file in out dist
fs.existsSync(path.resolve() + '/src/utils/PRGAThreadCom.js')

const pkgDirPath = path.dirname(process.argv[1])
const pkgThreadPath = pkgDirPath + '/PRGAThreadCom.js'
// dev threadPath
const threadPath = path.resolve() + '/src/utils/PRGAThread.js'

let index = 0
let PRGAExcuteThread = null
// 一定要加上这个，不然会产生递归，创建无数线程
if (isMainThread) {
  // 避免消耗光资源，加一用于后续的预加载RC4的位置
  const workerNum = parseInt(os.cpus().length / 2 + 1)
  const workerList = []
  for (let i = workerNum; i--; ) {
    let basePath = pkgThreadPath
    if (process.env.RUN_MODE === 'script') {
      basePath = threadPath
    }
    const worker = new Worker(basePath, {
      workerData: 'work-name-' + i,
    })
    worker._name = 'work-name-' + i
    workerList[i] = worker
    worker.on('error', (err) => {
      console.log('@@worker_error', worker, err)
    })
    // Message distribution by msgId
    worker.on('message', ({ msgId, resData }) => {
      worker.emit(msgId, resData)
    })
  }

  PRGAExcuteThread = function (data) {
    return new Promise((resolve, reject) => {
      const worker = workerList[index++ % workerNum]
      const msgId = randomUUID()
      worker.once(msgId, (res) => {
        resolve(res)
      })
      // send msg
      worker.postMessage({ msgId, data })
    })
  }
}

// 如果是线程执行了这个文件，就开始处理
if (!isMainThread) {
  // 异步线程去计算这个位置
  const PRGAExcute = function (data) {
    let { sbox: S, i, j, position } = data
    for (let k = 0; k < position; k++) {
      i = (i + 1) % 256
      j = (j + S[i]) % 256
      // swap
      const temp = S[i]
      S[i] = S[j]
      S[j] = temp
    }
    // return this position info
    return { sbox: S, i, j }
  }
  // workerData 由主线程发送过来的信息
  parentPort.on('message', ({ msgId, data }) => {
    const startTime = Date.now()
    const resData = PRGAExcute(data)
    parentPort.postMessage({ msgId, resData })
    const time = Date.now() - startTime
    console.log('@@@PRGAExcute-end', data.position, Date.now(), '@time:' + time, workerData)
  })
}
export default PRGAExcuteThread
