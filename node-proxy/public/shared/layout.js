// 布局注入：将 <template id="page-content"> 的内容包进 Tabler 侧边栏 + 顶栏骨架
// 页面约定: <body data-page="alist" data-page-title="Alist 配置">
import { requireAuth, logout } from './auth.js'
import { toast } from './ui.js'
import { icon, enhanceIcons } from './icons.js'

const MENUS = [
  { id: 'index', title: '概览', icon: 'ti-dashboard', href: '/public/index.html' },
  { id: 'alist', title: 'Alist 配置', icon: 'ti-cloud', href: '/public/alist.html' },
  { id: 'webdav', title: 'WebDAV 配置', icon: 'ti-folders', href: '/public/webdav.html' },
  { id: 'local', title: '云端加密', icon: 'ti-lock', href: '/public/local-encrypt.html' },
  { id: 'decrypt', title: '在线解密', icon: 'ti-lock-open', href: '/public/online-decrypt.html' }
]

const THEME_KEY = 'enc_theme'

function el(tag, cls, html) {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (html !== undefined) node.innerHTML = html
  return node
}

function buildSidebar(activeId) {
  // 菜单项结构对齐 Tabler 惯例（nav-link-icon 包图标）。
  // 注意：不要给链接加 data-bs-dismiss="offcanvas"——Bootstrap 对带此属性的 <a> 会
  // preventDefault 阻断跳转（SPA 靠 JS 路由无碍，多页面会直接点不动）；多页面跳转即整页刷新，抽屉自然收起
  const items = MENUS.map((m) => `
    <li class="nav-item ${m.id === activeId ? 'active' : ''}">
      <a class="nav-link" href="${m.href}">
        <span class="nav-link-icon">${icon(m.icon)}</span>
        <span class="nav-link-title">${m.title}</span>
      </a>
    </li>`).join('')
  // 结构参考 tablerdemo（IPTV 面板）：offcanvas 只包菜单（header 标题 + body 菜单），
  // 汉堡按钮和品牌留在外层 —— 手机端抽屉里菜单在标题下方；桌面端(≥992px) bootstrap
  // 自动让 .navbar-expand-lg .offcanvas 变 static 常驻，Tabler 将 aside 固定为左侧菜单
  const aside = el('aside', 'navbar navbar-vertical navbar-expand-lg')
  aside.innerHTML = `
    <div class="container-fluid">
      <button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#sidebar-menu" aria-label="打开菜单">
        <span class="navbar-toggler-icon"></span>
      </button>
      <h1 class="navbar-brand navbar-brand-autodark">
        <a href="/public/index.html">
          <img src="/public/logo.png" width="28" height="28" alt="logo" class="me-2">
          <span class="align-middle">alist-encrypt</span>
        </a>
      </h1>
      <div class="offcanvas offcanvas-start" tabindex="-1" id="sidebar-menu">
        <div class="offcanvas-header">
          <h2 class="offcanvas-title">
            <img src="/public/logo.png" width="24" height="24" alt="logo" class="me-2">
            alist-encrypt
          </h2>
          <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="关闭"></button>
        </div>
        <div class="offcanvas-body">
          <ul class="navbar-nav pt-lg-3">${items}</ul>
        </div>
      </div>
      <div class="mt-auto px-3 pb-3 d-none d-lg-block">
        <div class="text-muted small">管理控制台</div>
      </div>
    </div>`
  return aside
}

function buildTopbar(title) {
  // 顶栏全宽度可见：手机上也能切主题、看用户菜单、退出登录
  const header = el('header', 'navbar navbar-expand-md d-print-none')
  header.innerHTML = `
    <div class="container-xl">
      <h1 class="navbar-title py-3 ps-0" data-topbar-title></h1>
      <div class="navbar-nav flex-row order-md-last align-items-center">
        <a class="nav-link px-2 hide-theme-dark" href="#" data-theme-toggle title="切换暗色模式" aria-label="切换暗色模式">
          ${icon('moon-stars')}
        </a>
        <a class="nav-link px-2 hide-theme-light" href="#" data-theme-toggle title="切换亮色模式" aria-label="切换亮色模式">
          ${icon('sun-high')}
        </a>
        <div class="nav-item dropdown ms-2">
          <a href="#" class="nav-link d-flex lh-1 text-reset p-0" data-bs-toggle="dropdown">
            <span class="avatar avatar-sm bg-blue-lt" data-user-avatar>A</span>
            <div class="d-none d-xl-block ps-2">
              <div data-user-name>-</div>
              <div class="mt-1 small text-muted" data-user-version></div>
            </div>
          </a>
          <div class="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
            <a href="#" class="dropdown-item" data-logout>
              ${icon('logout', 'icon dropdown-item-icon')} 退出登录
            </a>
          </div>
        </div>
      </div>
    </div>`
  header.querySelector('[data-topbar-title]').textContent = title
  header.querySelectorAll('[data-theme-toggle]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault()
      toggleTheme()
    })
  })
  header.querySelector('[data-logout]').addEventListener('click', (e) => {
    e.preventDefault()
    logout()
    toast('已退出登录', 'info')
  })
  return header
}

export function toggleTheme() {
  const root = document.documentElement
  const dark = root.getAttribute('data-bs-theme') === 'dark'
  root.setAttribute('data-bs-theme', dark ? 'light' : 'dark')
  localStorage.setItem(THEME_KEY, dark ? 'light' : 'dark')
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

export async function boot() {
  const body = document.body
  const activeId = body.dataset.page || ''
  const title = body.dataset.pageTitle || ''
  document.title = title ? `${title} · alist-encrypt` : 'alist-encrypt'

  const tpl = document.getElementById('page-content')
  const topbar = buildTopbar(title)
  const pageBody = el('div', 'page-body')
  if (tpl) {
    pageBody.appendChild(tpl.content.cloneNode(true))
    tpl.remove()
  }
  const wrapper = el('div', 'page-wrapper')
  wrapper.appendChild(pageBody)
  const page = el('div', 'page')
  page.append(topbar, wrapper)
  // 顺序关键：aside 在前、.page 在后，Tabler 依赖 .navbar-vertical ~ .page 做左侧偏移
  document.body.append(buildSidebar(activeId), page)
  // 模板里的 <i class="ti ti-*"> 标记替换为内联 svg（之后动态插入的内容由 MutationObserver 自动处理）
  enhanceIcons(document.body)

  // 校验登录态并填充用户信息（未登录时 requireAuth 内部会跳转登录页）
  try {
    const data = await requireAuth()
    setUser(data.userInfo, data.version)
  } catch (e) {
    // 网络错误等：页面保留，提示错误；401 已由 api 层跳转
    if (e.code !== 401 && e.code !== 403 && e.message !== 'unauthorized') {
      console.error(e)
      toast(e.message || '获取用户信息失败', 'danger')
    }
  }
}

boot()
