import { fork } from 'child_process'
import { randomUUID } from 'crypto'
import os from 'os'
let index = parseInt(os.cpus().length / 2)

const childList = []
for (let i = index; i--; ) {
  const child = fork('./utils/PRGAExcute.js')
  childList[i] = child
  child.once('message', ({ msgId, resData }) => {
    child.emit(msgId, resData)
  })
}

const PRGAExcuteThread = function (workerData) {
  return new Promise((resolve, reject) => {
    const child = childList[index++ % childList.length]
    // 只监听一次，这样就可以重复监听
    const msgId = randomUUID()
    child.once(msgId, (res) => {
      resolve(res)
    })
    child.send(workerData)
  })
}

export default PRGAExcuteThread
