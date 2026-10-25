import { api } from '/public/shared/api.js'
import { toast } from '/public/shared/ui.js'
import { registerPage } from '/public/shared/router.js'

registerPage('overview', {
  mount() {
    const $ = (id) => document.getElementById(id)

    ;(async () => {
      const [userInfoRes, alistRes, webdavRes] = await Promise.allSettled([
        api('/getUserInfo', { plateFormId: 2 }),
        api('/getAlistConfig'),
        api('/getWebdavonfig')
      ])

      if (userInfoRes.status === 'fulfilled') {
        const d = userInfoRes.value.data
        $('stat-version').textContent = d.version || '-'
        $('pf-username').value = d.userInfo?.username || ''
      } else {
        console.error(userInfoRes.reason)
      }

      if (alistRes.status === 'fulfilled') {
        const c = alistRes.value.data || {}
        const list = c.passwdList || []
        $('stat-alist').textContent = `${c.serverHost || '-'}:${c.serverPort || '-'}`
        const enabled = list.filter((x) => x.enable).length
        $('stat-alist-sub').textContent = `密码组 ${enabled}/${list.length} 启用 · ${c.https ? 'https' : 'http'}`
      } else {
        $('stat-alist').textContent = '加载失败'
      }

      if (webdavRes.status === 'fulfilled') {
        const list = webdavRes.value.data || []
        $('stat-webdav').textContent = `${list.length} 个配置`
        const enabled = list.filter((x) => x.enable).length
        $('stat-webdav-sub').textContent = `${enabled} 个启用中`
      } else {
        $('stat-webdav').textContent = '加载失败'
      }
    })()

    $('passwd-form').addEventListener('submit', async (e) => {
      e.preventDefault()
      const oldPwd = $('pf-old').value
      const newPwd = $('pf-new').value
      const newPwd2 = $('pf-new2').value
      if (newPwd.length < 7) {
        toast('新密码至少 7 位字符', 'warning')
        return
      }
      if (newPwd !== newPwd2) {
        toast('两次输入的新密码不一致', 'warning')
        return
      }
      try {
        const res = await api('/updatePasswd', { username: $('pf-username').value, password: oldPwd, newpassword: newPwd })
        toast(res.msg || '密码修改成功')
        $('passwd-form').reset()
      } catch (err) {
        toast(err.message || '密码修改失败', 'danger')
      }
    })
  }
})
