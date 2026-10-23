// 密码组编辑器：alist 配置页与 WebDAV 配置弹窗共用的加密配置卡片列表
// list 为引用数组，collect 时合并回原对象，保留后端返回的未知字段

const ENC_TYPES = [
  { value: 'aesctr', label: 'AES-CTR（推荐）' },
  { value: 'chacha20', label: 'CHACHA20' },
  { value: 'rc4', label: 'RC4（已废弃）' }
]

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
}

function itemHtml(item, idx, withSubBtn) {
  const encOptions = ENC_TYPES.map((t) =>
    `<option value="${t.value}" ${item.encType === t.value ? 'selected' : ''}>${t.label}</option>`
  ).join('')
  return `
  <div class="card passwd-item" data-idx="${idx}">
    <div class="card-header d-flex align-items-center flex-wrap gap-2">
      <span class="badge bg-blue-lt">配置 ${idx + 1}</span>
      <label class="form-check form-switch m-0">
        <input class="form-check-input" type="checkbox" data-field="enable" ${item.enable ? 'checked' : ''}>
        <span class="form-check-label small">启用</span>
      </label>
      <div class="ms-auto d-flex gap-2">
        ${withSubBtn ? '<button type="button" class="btn btn-sm btn-outline-primary" data-sub-passwd><i class="ti ti-wand icon-sm"></i> 子密码/文件夹名</button>' : ''}
        <button type="button" class="btn btn-sm btn-outline-danger" data-del><i class="ti ti-trash icon-sm"></i> 删除</button>
      </div>
    </div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-sm-6 col-md-3">
          <label class="form-label">加密算法</label>
          <select class="form-select" data-field="encType">${encOptions}</select>
        </div>
        <div class="col-sm-6 col-md-3">
          <label class="form-label">密码</label>
          <input class="form-control" data-field="password" placeholder="加密密码" value="${esc(item.password)}">
        </div>
        <div class="col-sm-6 col-md-4">
          <label class="form-label">加密路径</label>
          <input class="form-control" data-field="encPath" placeholder="多个目录用逗号隔开，支持正则" value="${esc(item.encPath)}">
        </div>
        <div class="col-sm-6 col-md-2">
          <label class="form-label">备注</label>
          <input class="form-control" data-field="describe" placeholder="备注" value="${esc(item.describe)}">
        </div>
        <div class="col-sm-6">
          <label class="form-check form-switch">
            <input class="form-check-input" type="checkbox" data-field="encFolder" ${item.encFolder ? 'checked' : ''}>
            <span class="form-check-label">目录名加密</span>
          </label>
        </div>
        <div class="col-sm-6">
          <label class="form-check form-switch">
            <input class="form-check-input" type="checkbox" data-field="encName" ${item.encName ? 'checked' : ''}>
            <span class="form-check-label">文件名加密</span>
          </label>
        </div>
      </div>
    </div>
  </div>`
}

// opts: { withSubBtn, onSubPasswd(item), onDel(item, idx) }
export function renderPasswdList(container, list, opts = {}) {
  container.innerHTML = ''
  if (!list || !list.length) {
    container.innerHTML = `
      <div class="empty">
        <p class="empty-title">暂无密码组配置</p>
        <p class="empty-subtitle text-muted">点击「添加密码组」创建第一条加密配置</p>
      </div>`
    return
  }
  container.innerHTML = list.map((item, i) => itemHtml(item, i, opts.withSubBtn)).join('')

  container.querySelectorAll('.passwd-item').forEach((card) => {
    const idx = Number(card.dataset.idx)
    card.querySelector('[data-del]').addEventListener('click', () => {
      const item = list[idx]
      const doDel = () => {
        list.splice(idx, 1)
        renderPasswdList(container, list, opts)
      }
      if (opts.onDel) opts.onDel(item, idx, doDel)
      else doDel()
    })
    const subBtn = card.querySelector('[data-sub-passwd]')
    if (subBtn) subBtn.addEventListener('click', () => opts.onSubPasswd(list[idx]))
  })
}

// 读取编辑结果并合并回 list（保留未知字段），返回 list
export function collectPasswdList(container, list) {
  container.querySelectorAll('.passwd-item').forEach((card) => {
    const idx = Number(card.dataset.idx)
    const item = list[idx] || {}
    card.querySelectorAll('[data-field]').forEach((input) => {
      item[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.value.trim()
    })
    list[idx] = item
  })
  return list
}
