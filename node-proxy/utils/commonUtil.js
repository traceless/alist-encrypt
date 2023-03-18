import { pathToRegexp } from 'path-to-regexp'

// 判断是否为匹配的路径
export function pathExec(encPath, url) {
  for (const path of encPath) {
    const result = pathToRegexp(new RegExp(path)).exec(url)
    if (result) {
      return result
    }
  }
  return null
}
