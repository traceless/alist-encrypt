// 页面守卫与登录态管理
import { api, getToken, clearToken } from './api.js'

// 未登录跳登录页；已登录校验 token 并返回 getUserInfo 的 data
// data: { codes, userInfo, roles, version }
export async function requireAuth() {
  if (!getToken()) {
    location.replace('/public/login.html?redirect=' + encodeURIComponent(location.pathname + location.search))
    throw new Error('unauthorized')
  }
  const res = await api('/getUserInfo', { plateFormId: 2 })
  return res.data
}

export function logout() {
  clearToken()
  location.replace('/public/login.html')
}
