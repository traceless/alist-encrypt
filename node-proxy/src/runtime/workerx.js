/**
 * 线程运行时分发（P1 R6）
 *
 * 背景：RC4-MD5 的 PRGA 密钥流推进是 CPU 密集段，node 下走 worker_threads 线程池并行。
 * tjs 26.6.0 无任何线程能力（tjs:worker(s)/threading 模块不存在，全局亦无 Worker，已实测），
 * 且迁移决策 RC4 在 tjs 分支不启用（S1c），故 tjs 下做**同步 shim**：接口不变，
 * postMessage 后在主线程微任务内执行注册的计算体（registerWorkerTask），保证模块双端可加载、
 * RC4 路径即使被调用也能工作（仅无线程并行增益）。
 *
 * node：转发 worker_threads（零回退）；tjs：EventEmitter 风格 shim（on/once/off/emit/postMessage，
 * 语义对齐 PRGAThread.js 用法：worker.emit(msgId, res) 动态事件 + once 自动清理）。
 *
 * cpusCount：node os.cpus().length / tjs.system.cpus.length（tjs 的 system.cpus 是属性数组，
 * 元素形态 {model,speed,times} 与 os.cpus() 一致，已实测）。
 */
import { IS_TJS } from './isTjs.js'

let nodeWt = null
let nodeOs = null
if (!IS_TJS) {
  nodeWt = await import('node:worker_threads')
  nodeOs = await import('node:os')
}

export const isMainThread = IS_TJS ? true : nodeWt.isMainThread
export const workerData = IS_TJS ? undefined : nodeWt.workerData
export const parentPort = IS_TJS ? null : nodeWt.parentPort

/** CPU 逻辑核数（线程池大小依据） */
export function cpusCount() {
  return IS_TJS ? tjs.system.cpus.length : nodeOs.cpus().length
}

// ---------- tjs 同步 shim ----------

let taskFn = null

/**
 * 注册 tjs 下的 worker 计算体（node 下无效）
 * @param {(data: any) => any} fn
 */
export function registerWorkerTask(fn) {
  taskFn = fn
}

class ShimWorker {
  constructor() {
    this._handlers = {}
  }
  on(ev, cb) {
    ;(this._handlers[ev] ||= []).push(cb)
    return this
  }
  once(ev, cb) {
    const wrap = (d) => {
      this.off(ev, wrap)
      cb(d)
    }
    wrap._orig = cb
    ;(this._handlers[ev] ||= []).push(wrap)
    return this
  }
  off(ev, cb) {
    this._handlers[ev] = (this._handlers[ev] || []).filter((h) => h !== cb && h._orig !== cb)
  }
  emit(ev, data) {
    for (const cb of [...(this._handlers[ev] || [])]) cb(data)
  }
  postMessage(msg) {
    Promise.resolve().then(async () => {
      try {
        const resData = await taskFn(msg.data)
        this.emit('message', { msgId: msg.msgId, resData })
      } catch (e) {
        this.emit('error', e)
      }
    })
  }
}

export const Worker = IS_TJS ? ShimWorker : nodeWt.Worker
