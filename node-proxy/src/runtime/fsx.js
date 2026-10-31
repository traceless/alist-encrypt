/**
 * 文件系统运行时分发（P1 R4）—— 接口统一 async（用户决策）
 *
 * node 下：fs/promises + existsSync 包 Promise（行为与原 sync 调用一致，无回退）
 * tjs 下：全局 tjs 对象的 fs 方法（无 'tjs:fs' 模块；readDir 返回 async iterable；
 *         stat 的 isFile/isDirectory 为布尔属性，此处统一包装为方法形态对齐 node Stats）
 *
 * 流 API（createReadStream/createWriteStream）不在本层——P2 流式接缝/R5 logger 处理。
 *
 * 消费方迁移（R4 内完成）：config.js（顶层 async 化）、router.js、levelDB.js、convertFile.js；
 * env.js/logger.js 在 R5 波次切换。
 */
import { IS_TJS } from './isTjs.js'

const decoder = new TextDecoder()
const encoder = new TextEncoder()

function toBytes(data) {
  if (typeof data === 'string') return encoder.encode(data)
  return data
}

/** 文件/目录是否存在 */
export async function exists(path) {
  if (!IS_TJS) {
    const { existsSync } = await import('node:fs')
    return existsSync(path)
  }
  try {
    await tjs.stat(path)
    return true
  } catch (e) {
    return false
  }
}

/** 创建目录（opts.recursive 与 node 语义一致） */
export async function mkdir(path, opts = {}) {
  if (!IS_TJS) {
    const { mkdirSync } = await import('node:fs')
    mkdirSync(path, opts)
    return
  }
  await tjs.makeDir(path, { recursive: !!opts.recursive })
}

/** 读文件字节 -> Uint8Array */
export async function readFile(path) {
  if (!IS_TJS) {
    const { readFile } = await import('node:fs/promises')
    return new Uint8Array(await readFile(path))
  }
  return tjs.readFile(path)
}

/** 读文本文件（utf8）-> string */
export async function readFileText(path) {
  return decoder.decode(await readFile(path))
}

/** 写文件（string | Uint8Array） */
export async function writeFile(path, data) {
  if (!IS_TJS) {
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path, data)
    return
  }
  await tjs.writeFile(path, toBytes(data))
}

export async function rename(oldPath, newPath) {
  if (!IS_TJS) {
    const { rename } = await import('node:fs/promises')
    await rename(oldPath, newPath)
    return
  }
  await tjs.rename(oldPath, newPath)
}

/** 删除文件/目录（opts.recursive 与 node fs.rm 语义一致） */
export async function rm(path, opts = {}) {
  if (!IS_TJS) {
    const { rmSync } = await import('node:fs')
    rmSync(path, { ...opts, force: false })
    return
  }
  await tjs.remove(path, { recursive: !!opts.recursive })
}

/** 列目录 -> string[]（tjs readDir 的 async iterable 摊平为名字数组，对齐 fsp.readdir 默认形态） */
export async function readdir(path) {
  if (!IS_TJS) {
    const { readdir } = await import('node:fs/promises')
    return readdir(path)
  }
  const names = []
  const iter = await tjs.readDir(path)
  for await (const e of iter) names.push(typeof e === 'string' ? e : e.name)
  return names
}

/**
 * 文件状态 -> { isDirectory(), isFile(), size }（对齐 node Stats 常用面）
 * tjs 的 stat 对象 isFile/isDirectory 是布尔属性，包装为方法
 */
export async function stat(path) {
  if (!IS_TJS) {
    const { stat } = await import('node:fs/promises')
    return stat(path)
  }
  const st = await tjs.stat(path)
  return {
    isDirectory: () => !!st.isDirectory,
    isFile: () => !!st.isFile,
    size: st.size,
    mtime: st.mtime,
  }
}
