// workerx 双端测试的 node worker 入口（tjs 下不走文件加载，仅 node 使用）
import { parentPort, workerData } from '../src/runtime/workerx.js'

parentPort.on('message', ({ msgId, data }) => {
  parentPort.postMessage({
    msgId,
    resData: { echo: data, doubled: typeof data.n === 'number' ? data.n * 2 : null, wd: workerData },
  })
})
