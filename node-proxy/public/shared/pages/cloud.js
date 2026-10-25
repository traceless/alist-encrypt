import { api } from '/public/shared/api.js'
import { toast } from '/public/shared/ui.js'
import { registerPage } from '/public/shared/router.js'

registerPage('cloud', {
  mount() {
    const $ = (id) => document.getElementById(id)

    function currentOperation() {
      return document.querySelector('input[name="operation"]:checked').value
    }

    function refreshSubmitBtn() {
      const isEnc = currentOperation() === 'enc'
      $('ef-submit').innerHTML = isEnc
        ? '<i class="ti ti-lock icon me-1"></i> 执行加密'
        : '<i class="ti ti-lock-open icon me-1"></i> 执行解密'
      $('ef-submit').className = isEnc ? 'btn btn-primary' : 'btn btn-success'
    }

    document.querySelectorAll('input[name="operation"]').forEach((r) => r.addEventListener('change', refreshSubmitBtn))
    refreshSubmitBtn()

    $('enc-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const payload = {
        operation: currentOperation(),
        encType: $('ef-enc-type').value,
        password: $('ef-password').value,
        encFolder: $('ef-enc-folder').checked,
        encName: $('ef-enc-name').checked,
        folderPath: $('ef-folder-path').value.trim(),
        outPath: $('ef-out-path').value.trim()
      }
      if (!payload.password || !payload.folderPath) {
        toast('请填写密码和本地路径', 'warning')
        return
      }
      const btn = $('ef-submit')
      btn.disabled = true
      try {
        const res = await api('/encryptFile', payload)
        toast(res.msg === 'waiting operation' ? '任务已提交，后台处理中' : (res.msg || '已提交'), 'success', 4000)
      } catch (err) {
        toast(err.message || '提交失败', 'danger')
      } finally {
        btn.disabled = false
      }
    })
  }
})
