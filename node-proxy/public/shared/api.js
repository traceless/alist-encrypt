// 统一 API 封装：POST JSON + AUTHORIZETOKEN 头 + 响应包络解析
// 后端响应格式: { flag, msg, code, data }，code 200/0 成功，401/403 未登录
const TOKEN_KEY = 'enc_token'
const LOGIN_URL = '/public/login.html'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ''
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function redirectToLogin() {
  // SPA 下当前页面在 hash 里（/public/index.html#alist），回跳时要一并带上
  const redirect = location.pathname + location.search + location.hash
  location.replace(LOGIN_URL + '?redirect=' + encodeURIComponent(redirect))
}

export class ApiError extends Error {
  constructor(msg, code) {
    super(msg)
    this.code = code
  }
}

export async function api(path, data = {}) {
  let res
  try {
    res = await fetch('/enc-api' + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        AUTHORIZETOKEN: getToken()
      },
      body: JSON.stringify(data)
    })
  } catch (e) {
    throw new ApiError('无法连接服务，请确认 node-proxy 已启动', 0)
  }
  let body
  try {
    body = await res.json()
  } catch (e) {
    throw new ApiError('响应解析失败 (HTTP ' + res.status + ')', res.status)
  }
  const code = Number(body.code ?? 200)
  if (code === 401 || code === 403) {
    clearToken()
    redirectToLogin()
    throw new ApiError(body.msg || '登录已过期，请重新登录', code)
  }
  if (code !== 200 && code !== 0 && code !== 20000) {
    throw new ApiError(body.msg || '请求失败', code)
  }
  return body
}
