import { Worker, isMainThread, parentPort, workerData, cpusCount, registerWorkerTask } from '../runtime/workerx.js'
import { loadEnv, envGet } from '../runtime/envx.js'
import { IS_TJS } from '../runtime/isTjs.js'
import * as paths from '../runtime/paths.js'
import { randomUUID } from '../runtime/hashing.js'

// node: process.argv[1]（脚本/exe 路径）；tjs: tjs.args = [exePath, 'run', scriptPath]
const pkgDirPath = paths.dirname(IS_TJS ? tjs.args[2] : process.argv[1])
await loadEnv(pkgDirPath + '/.env')

const pkgThreadPath = pkgDirPath + '/PRGAThreadCom.js'
// dev threadPath（node worker 入口；tjs 无线程，shim 不加载文件，无需此路径）
let threadPath = null
if (!IS_TJS) {
  const { fileURLToPath } = await import('node:url')
  threadPath = fileURLToPath(new URL('./PRGAThread.js', import.meta.url))
}
let index = 0
let PRGAExcuteThread = null

// PRGA 密钥流推进计算体（模块级：node worker 分支与 tjs 同步 shim 共用）
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

// 一定要加上这个，不然会产生递归，创建无数线程
if (isMainThread) {
  // tjs 无线程能力（workerx 同步 shim）：注册计算体，postMessage 后主线程微任务执行
  if (IS_TJS) registerWorkerTask(PRGAExcute)
  // 避免消耗光资源，加一用于后续的预加载RC4的位置
  const workerNum = parseInt(cpusCount() / 2 + 1)
  const workerList = []
  for (let i = workerNum; i--; ) {
    let basePath = pkgThreadPath
    if (envGet('RUN_MODE') === 'DEV') {
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

// 如果是线程执行了这个文件，就开始处理（node worker 分支；tjs 下 isMainThread 恒 true 不会进入）
if (!isMainThread) {
  // 异步线程去计算这个位置
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
