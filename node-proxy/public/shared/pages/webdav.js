import { api } from '/public/shared/api.js'
import { toast, confirmDialog, bsModal, genId } from '/public/shared/ui.js'
import { renderPasswdList, collectPasswdList } from '/public/shared/passwd-editor.js'
import { registerPage } from '/public/shared/router.js'

registerPage('webdav', {
  mount() {
    const $ = (id) => document.getElementById(id)

    let configs = []
    let configModal = null
    let editingIdx = -1 // -1 = 新增

    ;(async () => {
      const res = await api('/getWebdavConfig')
      configs = res.data || []
      renderTable()
    })()

    function emptyConfig() {
      return {
        id: '',
        name: '',
        serverHost: '',
        serverPort: '5244',
        path: '',
        enable: true,
        passwdList: []
      }
    }

    function renderTable() {
      const tbody = $('config-tbody')
      if (!configs.length) {
        tbody.innerHTML = `
          <tr><td colspan="6">
            <div class="empty"><p class="empty-title">暂无 WebDAV 配置</p>
            <p class="empty-subtitle text-muted">点击右上角「新增配置」创建第一条配置</p></div>
          </td></tr>`
        return
      }
      tbody.innerHTML = configs.map((c, i) => `
        <tr>
          <td><strong>${esc(c.name)}</strong></td>
          <td class="text-muted">${esc(c.serverHost)}:${esc(c.serverPort)}</td>
          <td class="font-monospace small">${esc(c.path)}</td>
          <td>${(c.passwdList || []).length}</td>
          <td>${c.enable ? '<span class="badge bg-success-lt">启用</span>' : '<span class="badge bg-secondary-lt">停用</span>'}</td>
          <td class="text-end">
            <button class="btn btn-sm btn-ghost-primary" data-edit="${i}" title="编辑"><i class="ti ti-pencil icon"></i></button>
            <button class="btn btn-sm btn-ghost-danger" data-del="${i}" title="删除"><i class="ti ti-trash icon"></i></button>
          </td>
        </tr>`).join('')
      tbody.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openModal(Number(b.dataset.edit))))
      tbody.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => del(Number(b.dataset.del))))
    }

    function esc(s) {
      return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
    }

    function normalize(c) {
      // passwdList 的 encPath 后端存数组，编辑器统一用逗号字符串
      return {
        ...c,
        passwdList: (c.passwdList || []).map((p) => ({
          ...p,
          encPath: Array.isArray(p.encPath) ? p.encPath.join(',') : (p.encPath ?? '')
        }))
      }
    }

    // ---------- 弹窗 ----------
    let modalList = []

    const delPasswdHandler = async (item, i, done) => {
      const ok = await confirmDialog({ title: '删除密码组', text: `确定删除「${item.describe || '配置 ' + (i + 1)}」吗？`, okText: '删除', danger: true })
      if (ok) done()
    }

    function openModal(idx) {
      editingIdx = idx
      const isEdit = idx >= 0
      const src = isEdit ? normalize(configs[idx]) : emptyConfig()
      modalList = src.passwdList
      $('cm-title').textContent = isEdit ? `编辑配置 · ${src.name || ''}` : '新增配置'
      $('cm-name').value = src.name
      $('cm-host').value = src.serverHost
      $('cm-port').value = src.serverPort
      $('cm-path').value = src.path
      $('cm-enable').checked = !!src.enable
      renderPasswdList($('cm-passwd-list'), modalList, { withSubBtn: false, onDel: delPasswdHandler })
      configModal = configModal || bsModal($('config-modal'))
      configModal.show()
    }

    $('add-btn').addEventListener('click', () => openModal(-1))

    $('cm-add-passwd').addEventListener('click', () => {
      collectPasswdList($('cm-passwd-list'), modalList)
      modalList.push({ id: genId(), enable: true, encType: 'aesctr', password: '', encName: false, encFolder: false, describe: '', encPath: '' })
      renderPasswdList($('cm-passwd-list'), modalList, { withSubBtn: false, onDel: delPasswdHandler })
    })

    $('cm-save').addEventListener('click', async () => {
      collectPasswdList($('cm-passwd-list'), modalList)
      const payload = {
        ...(editingIdx >= 0 ? configs[editingIdx] : {}),
        name: $('cm-name').value.trim(),
        serverHost: $('cm-host').value.trim(),
        serverPort: $('cm-port').value.trim(),
        path: $('cm-path').value.trim(),
        enable: $('cm-enable').checked,
        passwdList: modalList
      }
      if (!payload.name || !payload.serverHost) {
        toast('服务名称和服务器地址必填', 'warning')
        return
      }
      try {
        const saveRes = editingIdx >= 0
          ? await api('/updateWebdavConfig', payload)
          : await api('/saveWebdavConfig', payload)
        configs = saveRes.data || []
        configModal.hide()
        renderTable()
        toast(editingIdx >= 0 ? '更新成功' : '新增成功')
      } catch (e) {
        toast(e.message || '保存失败', 'danger')
      }
    })

    // ---------- 删除 ----------
    async function del(idx) {
      const c = configs[idx]
      const ok = await confirmDialog({
        title: '删除配置',
        text: `确定删除 WebDAV 配置「${c.name || c.serverHost}」吗？删除后需重启服务。`,
        okText: '删除',
        danger: true
      })
      if (!ok) return
      try {
        const delRes = await api('/delWebdavConfig', { id: c.id })
        configs = delRes.data || []
        renderTable()
        toast('删除成功')
      } catch (e) {
        toast(e.message || '删除失败', 'danger')
      }
    }
  }
})
