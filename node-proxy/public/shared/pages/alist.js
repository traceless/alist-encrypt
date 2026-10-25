import { api } from '/public/shared/api.js'
import { toast, confirmDialog, bsModal, genId } from '/public/shared/ui.js'
import { renderPasswdList, collectPasswdList } from '/public/shared/passwd-editor.js'
import { registerPage } from '/public/shared/router.js'

registerPage('alist', {
  mount() {
    const $ = (id) => document.getElementById(id)
    const httpsSwitch = $('al-https')

    let config = null
    let folderModal = null
    let currentItem = null

    httpsSwitch.addEventListener('change', () => {
      $('al-https-label').textContent = httpsSwitch.checked ? 'https' : 'http'
    })

    // ---------- 加载配置 ----------
    ;(async () => {
      const res = await api('/getAlistConfig')
      config = res.data || {}
      $('al-host').value = config.serverHost ?? ''
      $('al-port').value = config.serverPort ?? ''
      httpsSwitch.checked = !!config.https
      $('al-https-label').textContent = config.https ? 'https' : 'http'
      // encPath 后端存的是数组，表单统一用逗号字符串
      config.passwdList = (config.passwdList || []).map((p) => ({
        ...p,
        encPath: Array.isArray(p.encPath) ? p.encPath.join(',') : (p.encPath ?? '')
      }))
      renderPasswd()
    })()

    function renderPasswd() {
      renderPasswdList($('passwd-list'), config.passwdList, {
        withSubBtn: true,
        onSubPasswd: openFolderModal,
        onDel: async (item, idx, done) => {
          const ok = await confirmDialog({ title: '删除密码组', text: `确定删除「${item.describe || '配置 ' + (idx + 1)}」吗？`, okText: '删除', danger: true })
          if (ok) done()
        }
      })
    }

    $('add-passwd').addEventListener('click', () => {
      collectPasswdList($('passwd-list'), config.passwdList)
      config.passwdList.push({
        id: genId(),
        enable: true,
        encType: 'aesctr',
        password: '',
        encName: false,
        encFolder: false,
        describe: '',
        encPath: ''
      })
      renderPasswd()
    })

    // ---------- 保存 ----------
    $('save-btn').addEventListener('click', async () => {
      collectPasswdList($('passwd-list'), config.passwdList)
      const payload = {
        ...config,
        serverHost: $('al-host').value.trim(),
        serverPort: $('al-port').value.trim(),
        https: httpsSwitch.checked
      }
      const btn = $('save-btn')
      btn.disabled = true
      try {
        const saveRes = await api('/saveAlistConfig', payload)
        toast(saveRes.msg || '保存成功')
      } catch (e) {
        toast(e.message || '保存失败', 'danger')
      } finally {
        btn.disabled = false
      }
    })

    // ---------- 文件夹名加解密 ----------
    function openFolderModal(item) {
      currentItem = item
      document.querySelector('[data-base-pwd]').textContent = item.password || '(未设置)'
      document.querySelector('[data-base-enc]').textContent = item.encType || 'aesctr'
      $('fm-result-wrap').classList.add('d-none')
      $('fm-copy-btn').classList.add('d-none')
      $('fm-dec-result').classList.add('d-none')
      folderModal = folderModal || bsModal($('folder-modal'))
      folderModal.show()
    }

    $('fm-encode-btn').addEventListener('click', async () => {
      if (!currentItem) return
      const folderName = $('fm-name').value.trim()
      const folderPasswd = $('fm-passwd').value.trim()
      if (!folderName || !folderPasswd) {
        toast('请填写文件夹备注和子目录密码', 'warning')
        return
      }
      try {
        const encodeRes = await api('/encodeFoldName', {
          password: currentItem.password,
          encType: currentItem.encType,
          folderPasswd,
          folderEncType: $('fm-enc-type').value
        })
        const full = `${folderName}&${encodeRes.data.folderNameEnc}`
        $('fm-result').value = full
        $('fm-result-wrap').classList.remove('d-none')
        $('fm-copy-btn').classList.remove('d-none')
        $('fm-copy-btn').className = 'btn btn-outline-secondary'
      } catch (e) {
        toast(e.message || '生成失败', 'danger')
      }
    })

    $('fm-copy-btn').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('fm-result').value)
        toast('已复制到剪贴板')
      } catch (e) {
        toast('复制失败，请手动复制', 'danger')
      }
    })

    $('fm-decode-btn').addEventListener('click', async () => {
      if (!currentItem) return
      const folderNameEnc = $('fm-dec-input').value.trim()
      if (!folderNameEnc) {
        toast('请粘贴文件夹密文名', 'warning')
        return
      }
      try {
        const decodeRes = await api('/decodeFoldName', {
          password: currentItem.password,
          encType: currentItem.encType,
          folderNameEnc
        })
        document.querySelector('[data-dec-pwd]').textContent = decodeRes.data.folderPasswd
        document.querySelector('[data-dec-enc]').textContent = decodeRes.data.folderEncType
        $('fm-dec-result').classList.remove('d-none')
      } catch (e) {
        toast(e.message || '解密失败', 'danger')
      }
    })
  }
})
