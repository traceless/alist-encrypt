/**
 * 运行时探测（P1 R0）
 *
 * 双运行时共存的唯一判定入口：后续所有 runtime/* 模块据此分发 node 原生实现
 * 与 tjs 适配实现。node 下零行为变化（A/B 不回退红线）。
 *
 * 注意：txiki.js 的全局对象是 tjs（globalThis.tjs），node 下该标识符未定义，
 * 必须用 typeof 探测而非直接引用。
 */
export const IS_TJS = typeof tjs !== 'undefined'

export const RUNTIME = IS_TJS ? 'tjs' : 'node'

/** 双端各自的工作目录（node: process.cwd() 函数 / tjs: tjs.cwd 字符串属性） */
export function cwd() {
  return IS_TJS ? tjs.cwd : process.cwd()
}

/**
 * 跨运行时安全退出：tjs 下 process 未绑定（typeof 判断避免 ReferenceError），
 * node 下用 process.exit 保证退出码传递
 */
export function fatalExit(code) {
  if (typeof process !== 'undefined' && process.exit) process.exit(code)
  else if (typeof tjs !== 'undefined') tjs.exit(code)
}
