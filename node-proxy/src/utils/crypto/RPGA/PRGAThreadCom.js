const { isMainThread, parentPort, workerData } = require('worker_threads')

// is not MainThread
if (!isMainThread) {
  // Excute the posistion info
  const PRGAExecute = function (data) {
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
    const resData = PRGAExecute(data)
    parentPort.postMessage({ msgId, resData })
    const time = Date.now() - startTime
    console.log('@@@PRGAExecute-end', data.position, Date.now(), '@time:' + time, workerData)
  })
}
