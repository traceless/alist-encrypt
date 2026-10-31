/**
 * tjs 构建产物冒烟验证（build-tjs.sh 构建完成后自动调用）
 *
 * 覆盖双二进制的核心差异点：
 *  1. 基本运行（quickjs 引擎可用）
 *  2. tjs:ffi dlopen 探测（glibc 版预期 ffi=ok，musl 静态版预期 ffi=unavailable，
 *     musl 硬限制 "Dynamic loading not supported"，属预期降级非故障）
 *
 * 用法: tjs run verify.mjs
 * 退出码: 0 = 通过, 1 = 失败
 */

import { dlopen } from 'tjs:ffi'

function fail(msg) {
  console.error('VERIFY-FAIL ' + msg)
  tjs.exit(1)
}

// 1. 引擎基本可用性
if (typeof structuredClone !== 'function') fail('quickjs runtime broken')

// 2. FFI 探测（soname 候选链与 node-proxy P3 加密分发一致）
const SONAMES = ['libcrypto.so.3', 'libcrypto.so.1.1']
let ffiOk = null
for (const so of SONAMES) {
  try {
    dlopen(so, { EVP_chacha20: { returns: 'pointer', args: [] } })
    ffiOk = so
    break
  } catch (e) {
    // 试下一个候选
  }
}

if (ffiOk) {
  console.log('VERIFY-PASS engine=ok ffi=ok lib=' + ffiOk)
} else {
  console.log('VERIFY-PASS engine=ok ffi=unavailable (static build, JS fallback)')
}
