// SPA hash 路由（结构参考 tablerdemo）：壳层常驻，页面片段懒加载 + 显隐切换
// 页面片段注入后 <script> 不会执行，页面逻辑统一放 shared/pages/*.js 用 registerPage({ mount }) 注册
const MENUS = [
  { id: 'overview', title: '概览', icon: 'ti-dashboard', partial: '/public/partials/overview.html' },
  { id: 'alist', title: 'Alist 配置', icon: 'ti-cloud', partial: '/public/partials/alist.html' },
  { id: 'webdav', title: 'WebDAV 配置', icon: 'ti-folders', partial: '/public/partials/webdav.html' },
  { id: 'cloud', title: '云端加密', icon: 'ti-lock', partial: '/public/partials/cloud-encrypt.html' },
  { id: 'decrypt', title: '在线解密', icon: 'ti-lock-open', partial: '/public/partials/online-decrypt.html' }
]

const PAGES = MENUS.map((m) => m.id)
const pageHooks = new Map()
const mounted = new Set()

export function registerPage(name, hooks = {}) {
  pageHooks.set(name, hooks)
}

export function setUser(userInfo, version) {
  const name = (userInfo && userInfo.username) || '-'
  document.querySelectorAll('[data-user-name]').forEach((n) => (n.textContent = name))
  const avatar = document.querySelector('[data-user-avatar]')
  if (avatar) avatar.textContent = name.charAt(0).toUpperCase()
  if (version) {
    const v = document.querySelector('[data-user-version]')
    if (v) v.textContent = 'v' + version
  }
}

export function toggleTheme() {
  const root = document.documentElement
  const dark = root.getAttribute('data-bs-theme') === 'dark'
  root.setAttribute('data-bs-theme', dark ? 'light' : 'dark')
  localStorage.setItem('enc_theme', dark ? 'light' : 'dark')
}

async function ensureReady(name) {
  const el = document.getElementById(`page-${name}`)
  if (mounted.has(name)) return
  const menu = MENUS.find((m) => m.id === name)
  const res = await fetch(menu.partial)
  if (!res.ok) throw new Error(`页面片段加载失败(${res.status})：${menu.title}`)
  el.innerHTML = await res.text()
  // 注入的图标标记转内联 svg（顶栏/侧栏静态部分已在启动时转换）
  const { enhanceIcons } = await import('./icons.js')
  enhanceIcons(el)
  mounted.add(name)
  pageHooks.get(name)?.mount?.()
}

export function switchPage(name) {
  if (!PAGES.includes(name)) name = 'overview'
  const menu = MENUS.find((m) => m.id === name)

  document.querySelectorAll('.page-content').forEach((el) => {
    el.classList.toggle('d-none', el.id !== `page-${name}`)
  })
  document.querySelectorAll('.nav-link[data-page]').forEach((el) => {
    el.classList.toggle('active', el.dataset.page === name)
  })
  const cur = location.hash.slice(1)
  if (cur !== name) history.replaceState(null, '', `#${name}`)
  const titleEl = document.querySelector('[data-topbar-title]')
  if (titleEl) titleEl.textContent = menu.title
  document.title = `${menu.title} · alist-encrypt`

  // 已挂载：直接显示（状态保留，正是 SPA 的收益）；未挂载：加载片段后 mount
  if (mounted.has(name)) {
    pageHooks.get(name)?.onShow?.()
    return
  }
  const el = document.getElementById(`page-${name}`)
  el.innerHTML = '<div class="text-secondary text-center py-4">加载中...</div>'
  ensureReady(name).then(() => {
    pageHooks.get(name)?.onShow?.()
  }).catch((err) => {
    console.error('[router]', err)
    el.innerHTML = '<div class="alert alert-danger">页面片段加载失败，请刷新页面重试</div>'
  })
}

export function startRouter() {
  // 菜单点击：拦截跳转切换页面；data-bs-dismiss 让手机抽屉随之收起（桌面 offcanvas 为常驻态，无副作用）
  document.querySelectorAll('.nav-link[data-page]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault()
      switchPage(link.dataset.page)
    })
  })
  // 浏览器前进/后退
  window.addEventListener('hashchange', () => {
    switchPage(location.hash.slice(1) || 'overview')
  })
  switchPage(location.hash.slice(1) || 'overview')
}
