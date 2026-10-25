// 轻量 UI 反馈组件：toast 提示 + 确认弹窗（基于 Tabler/Bootstrap 样式）

let toastWrap = null

// type: success | danger | warning | info
export function toast(msg, type = 'success', duration = 2600) {
  if (!toastWrap) {
    toastWrap = document.createElement('div')
    toastWrap.className = 'position-fixed top-0 end-0 p-3'
    toastWrap.style.zIndex = 3000
    document.body.appendChild(toastWrap)
  }
  const icons = { success: 'circle-check', danger: 'alert-circle', warning: 'alert-triangle', info: 'info-circle' }
  const item = document.createElement('div')
  item.className = `alert alert-${type} shadow-sm mb-2 d-flex align-items-center`
  item.setAttribute('role', 'alert')
  const icon = document.createElement('i')
  icon.className = `ti ti-${icons[type] || 'info-circle'} icon me-2`
  const text = document.createElement('span')
  text.textContent = msg
  item.append(icon, text)
  toastWrap.appendChild(item)
  setTimeout(() => {
    item.style.transition = 'opacity .3s'
    item.style.opacity = '0'
    setTimeout(() => item.remove(), 300)
  }, duration)
}

// tabler.min.js 的 UMD 全局是 window.tabler，bootstrap 组件挂在 window.tabler.bootstrap 下
export function bsModal(el) {
  const bs = window.bootstrap || window.tabler?.bootstrap
  if (!bs) throw new Error('bootstrap JS 未加载')
  return new bs.Modal(el)
}

// 唯一 ID：crypto.randomUUID 仅安全上下文（HTTPS/localhost）可用，
// 局域网 IP 访问时为 undefined，这里做兜底
export function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

// opts: { title, text, okText, danger }
export function confirmDialog(opts = {}) {
  return new Promise((resolve) => {
    const id = 'confirm-' + Date.now()
    const wrap = document.createElement('div')
    const btnCls = opts.danger ? 'btn-danger' : 'btn-primary'
    wrap.innerHTML = `
      <div class="modal modal-blur fade" id="${id}" tabindex="-1">
        <div class="modal-dialog modal-sm modal-dialog-centered" role="document">
          <div class="modal-content">
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="关闭"></button>
            <div class="modal-status ${opts.danger ? 'bg-danger' : 'bg-primary'}"></div>
            <div class="modal-body text-center py-4">
              <i class="ti ti-${opts.danger ? 'alert-triangle' : 'help'} icon icon-lg mb-2 ${opts.danger ? 'text-danger' : 'text-primary'}"></i>
              <h3 class="mb-2"></h3>
              <div class="text-muted"></div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-link link-secondary" data-bs-dismiss="modal">取消</button>
              <button type="button" class="btn ${btnCls}" data-ok></button>
            </div>
          </div>
        </div>
      </div>`
    wrap.querySelector('h3').textContent = opts.title || '确认操作'
    wrap.querySelector('.modal-body .text-muted').textContent = opts.text || ''
    wrap.querySelector('[data-ok]').textContent = opts.okText || '确认'
    document.body.appendChild(wrap.firstElementChild)

    const modalEl = document.getElementById(id)
    const modal = bsModal(modalEl)
    let decided = false
    modalEl.querySelector('[data-ok]').addEventListener('click', () => {
      decided = true
      modal.hide()
    })
    modalEl.addEventListener('hidden.bs.modal', () => {
      modalEl.remove()
      resolve(decided)
    }, { once: true })
    modal.show()
  })
}
