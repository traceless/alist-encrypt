import { Worker, isMainThread, parentPort, workerData } from 'worker_threads'
import os from 'os'
let index = parseInt(os.cpus().length / 2)

const workerList = []
for (let i = index; i--; ) {
  const worker = new Worker('./utils/PRGAThread.js', {
    workerData: 'work-name-' + i,
  })
  workerList[i] = worker
}

const PRGAExcuteThread = function (data) {
  return new Promise((resolve, reject) => {
    const worker = workerList[index++ % 4]
    worker.once('message', (res) => {
      resolve(res)
    })
    worker.once('error', reject)
    // 发送数据
    worker.postMessage(data)
  })
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
    // 记录位置，下次继续伪随机
    return { sbox: S, i, j }
  }
  // workerData 由主线程发送过来的信息
  parentPort.on('message', (data) => {
    console.log('@@@PRGAExcuteThread-strat', data.position, workerData)
    const res = PRGAExcute(data)
    parentPort.postMessage(res)
    console.log('@@@PRGAExcuteThread-end', data.position, workerData)
  })
}
export default PRGAExcuteThread
