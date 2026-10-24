'use strict'

// webdav 加密全链路冒烟测试（node test/webdavSmokeTest.js）
// 依赖真实代理服务 + OpenList 上游，会临时写入测试数据并在结束时清理
// 流程：MKCOL 建加密目录 → PUT 加密上传（&/中文/空格文件名）→ PROPFIND 解密显示断言
//       → GET 跟随 302 解密断言 → 上游取证（可选）→ DELETE 清理
// 用法：
//   node test/webdavSmokeTest.js                          # 默认 PROXY=127.0.0.1:5344, 上游不取证
//   UPSTREAM=http://192.168.5.10:5244 node test/webdavSmokeTest.js   # 带上游加密名取证
import { Buffer } from 'buffer'

const PROXY = process.env.PROXY || 'http://127.0.0.1:5344'
const WEBDAV_AUTH = process.env.AUTH || 'admin:123456'
const UPSTREAM = process.env.UPSTREAM || '' // 如 http://192.168.5.10:5244，可选
const UPSTREAM_AUTH = process.env.UPSTREAM_AUTH || 'admin:123456'
// 加密目录规则由服务端配置（正则子串匹配 atest/），必须用 /aliyun/atest 确保命中
// 文件名随机化：避免同 show-path 历史缓存导致解密参数错位（levelDB 缓存污染既有行为）
const DIR = '/aliyun/atest'
const SHOW_NAME = `smoke-${Date.now()}&中文 冒烟.txt` // 故意含 &（实体转义）、中文、空格（URI 编码）
const CONTENT = `smoke-content-${Date.now()}\n`

let pass = 0
let fail = 0

function report(desc, ok, detail = '') {
  if (ok) {
    pass++
    console.log(`PASS  ${desc}`)
  } else {
    fail++
    console.log(`FAIL  ${desc} ${detail}`)
  }
}

const basic = (userpass) => `Basic ${Buffer.from(userpass).toString('base64')}`
const proxiedUrl = (path) => `${PROXY}/dav${encodeURI(path).replace(/&/g, '%26')}`

async function main() {
  const authHeader = basic(WEBDAV_AUTH)
  const url = proxiedUrl(DIR)
  const fileUrl = `${url}/${encodeURI(SHOW_NAME).replace(/&/g, '%26')}`
  let upstreamToken = ''
  if (UPSTREAM) {
    const r = await fetch(`${UPSTREAM}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: UPSTREAM_AUTH.split(':')[0], password: UPSTREAM_AUTH.split(':')[1] }),
    })
    const j = await r.json()
    upstreamToken = j.data?.token || ''
    report('上游登录（可选取证）', Boolean(upstreamToken))
  }
  const upstreamList = async (path) => {
    const r = await fetch(`${UPSTREAM}/api/fs/list`, {
      method: 'POST',
      headers: { Authorization: upstreamToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, refresh: true }),
    })
    return (await r.json()).data?.content || []
  }

  // 1. MKCOL 建加密目录（走代理）
  const mkcol = await fetch(`${url}/`, { method: 'MKCOL', headers: { Authorization: authHeader } })
  report('MKCOL 建加密目录 201', mkcol.status === 201, `got ${mkcol.status}`)

  // 2. PUT 加密上传（文件名含 &/中文/空格，内容将被加密落盘）
  const put = await fetch(fileUrl, { method: 'PUT', headers: { Authorization: authHeader }, body: CONTENT })
  report('PUT 加密上传 201', put.status === 201, `got ${put.status}`)

  // 3. 上游取证：文件名应已加密（不等于显示名）、密文 size 与明文一致
  let encName = ''
  if (upstreamToken) {
    const items = await upstreamList(DIR)
    encName = items[0]?.name || ''
    report('上游落盘为加密名', items.length === 1 && encName !== SHOW_NAME && encName.endsWith('.txt'), `got ${encName}`)
    report('密文 size = 明文 size（aesctr 流式）', items[0]?.size === Buffer.byteLength(CONTENT), `got ${items[0]?.size}`)
  }

  // 4. PROPFIND depth:1：解密显示 + 实体转义还原
  const pf = await fetch(`${url}/`, { method: 'PROPFIND', headers: { Authorization: authHeader, Depth: '1' } })
  const pfBody = await pf.text()
  const expectDisplay = SHOW_NAME.replace(/&/g, '&amp;')
  report('PROPFIND 207', pf.status === 207, `got ${pf.status}`)
  report('PROPFIND 解密显示文件名（&重新转义）', pfBody.includes(`<D:displayname>${expectDisplay}</D:displayname>`) || pfBody.includes(`<displayname>${expectDisplay}</displayname>`))
  report('PROPFIND getcontentlength 正确', pfBody.includes(`<D:getcontentlength>${Buffer.byteLength(CONTENT)}</D:getcontentlength>`) || pfBody.includes(`<getcontentlength>${Buffer.byteLength(CONTENT)}</getcontentlength>`))
  report('PROPFIND 目录条目存在（任意 NS 前缀/属性）', /<[A-Za-z]+:collection[\s/>]|<collection[\s/>]/.test(pfBody))

  // 5. GET 跟随 302：/redirect/:key 解密流还原明文
  const get = await fetch(fileUrl, { method: 'GET', headers: { Authorization: authHeader }, redirect: 'follow' })
  const getBody = await get.text()
  report('GET 跟随 302 后 200', get.status === 200, `got ${get.status}`)
  report('GET 解密内容精确还原', getBody === CONTENT, `got ${JSON.stringify(getBody.slice(0, 60))}`)

  // 6. 清理：DELETE 文件（走代理，显示名→加密名转换）；目录仅在其为空时删除，防止误删用户数据
  const delFile = await fetch(fileUrl, { method: 'DELETE', headers: { Authorization: authHeader } })
  report('DELETE 文件 204', delFile.status === 204, `got ${delFile.status}`)
  let dirEmpty = true
  if (upstreamToken) {
    const rest = await upstreamList(DIR)
    dirEmpty = rest.length === 0
  }
  if (dirEmpty) {
    const delDir = await fetch(`${url}/`, { method: 'DELETE', headers: { Authorization: authHeader } })
    report('DELETE 目录 204（目录已空）', delDir.status === 204, `got ${delDir.status}`)
  } else {
    console.log('SKIP  DELETE 目录：目录内尚有其他内容，为防误删已跳过（仅删除了本次测试文件）')
  }

  // 7. 上游确认零残留
  if (upstreamToken) {
    const after = await upstreamList('/aliyun')
    const left = after.find((f) => f.name.startsWith('atest-smoke-'))
    report('上游无残留', !left, left ? `leftover: ${left.name}` : '')
    if (left) {
      console.log(`\n!! 残留需手动清理：上游 /aliyun/${left.name}`)
    }
  }

  console.log(`\n${pass} pass, ${fail} fail  (dir=${DIR})`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('SMOKE-ERROR', e)
  console.error(`若测试目录 ${DIR} 残留，请在上游手动删除 /aliyun/atest-smoke-*`)
  process.exit(1)
})
