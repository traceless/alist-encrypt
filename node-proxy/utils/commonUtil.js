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
// 检查
export function pathFindPasswd(passwdList, url) {
  for (const passwdInfo of passwdList) {
    for (const path of passwdInfo.encPath) {
      const result = pathToRegexp(new RegExp(path)).exec(url)
      if (result) {
        return { passwdInfo, pathInfo: result }
      }
    }
  }
  return {}
}
