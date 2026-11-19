// A/B 对照测试（只读）：A=192.168.5.14:5344 (koa 基准)  B=127.0.0.1:5344 (hono 被测)
// 2026-10-26 重建版：原脚本未入 git 随分支切换丢失，按 /tmp 早期版 + 项目记忆重建（14 项，基准路径 /aliyun/atest）
// 基线：13/14 PASS，唯一差异 = koa 空 body 自动补 text/plain 头（框架默认，接受）
const A = 'http://192.168.5.14:5344'
const B = 'http://127.0.0.1:5344'

// 代理对 /api/fs/* 透明转发不注入凭据 → 先登录上游拿 token（A/B 各自一份）
async function upstreamLogin(base) {
  const r = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: '123456' }),
  })
  const j = await r.json()
  if (j.code !== 200) throw new Error(`上游登录失败(${base}): ${j.message || j.msg}`)
  return j.data.token
}
const TOKENS = {}
for (const base of [A, B]) TOKENS[base] = await upstreamLogin(base)

const norm = (s) =>
  s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/"jwtToken":"[^"]*"/g, '"jwtToken":"<TOKEN>"')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<TS>')

async function req(base, { method = 'GET', path, body, headers = {}, auth = false }) {
  if (auth) headers = { ...headers, authorization: TOKENS[base] }
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json', ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, ctype: res.headers.get('content-type') || '', text }
}

function diffObj(a, b) {
  const na = JSON.parse(norm(a.text)), nb = JSON.parse(norm(b.text))
  const sortContent = (o) => {
    if (o?.data?.content) o.data.content.sort((x, y) => (x.name > y.name ? 1 : -1))
    return o
  }
  const ja = JSON.stringify(sortContent(na)), jb = JSON.stringify(sortContent(nb))
  if (ja === jb) return null
  // 找首个差异位置
  let i = 0
  while (i < Math.min(ja.length, jb.length) && ja[i] === jb[i]) i++
  return `at[${i}] A=...${ja.slice(Math.max(0, i - 30), i + 60)}... B=...${jb.slice(Math.max(0, i - 30), i + 60)}...`
}

// PROPFIND body 规范化：上游 OpenList(Go map 序)每次请求随机化 <D:prop> 内属性顺序，
// 同一服务连续两次请求 body 都不同 → 必须按块排序 + prop 子元素排序后再比较
function canonXml(text) {
  const responses = norm(text).match(/<D:response>[\s\S]*?<\/D:response>/g) || []
  const canonResp = (r) => {
    const prop = r.match(/<D:prop>[\s\S]*?<\/D:prop>/)
    if (!prop) return r
    const inner = prop[0].slice('<D:prop>'.length, -'</D:prop>'.length)
    const parts = inner.match(/<D:(resourcetype|displayname|getlastmodified|getcontentlength|getcontenttype|getetag|creationdate|supportedlock)[^>]*>[\s\S]*?<\/D:\1>|<checksums[^>]*>[\s\S]*?<\/checksums>/g) || [inner]
    return r.replace(prop[0], `<D:prop>${parts.slice().sort().join('')}</D:prop>`)
  }
  return responses.map(canonResp).sort().join('|')
}

const results = []
async function run(name, opts) {
  const [ra, rb] = await Promise.all([req(A, opts), req(B, opts)])
  let detail
  if (opts.code200) {
    // 防两侧一致地失败被误判 PASS：显式断言 alist 信封 code===200
    for (const [side, r] of [['A', ra], ['B', rb]]) {
      try {
        const j = JSON.parse(r.text)
        if (j.code !== undefined && j.code !== 200) return void results.push(`FAIL  ${name}\n      ${side} code=${j.code} ${j.message || j.msg || ''}`)
      } catch {}
    }
  }
  if (ra.status !== rb.status) detail = `status A=${ra.status} B=${rb.status}`
  else if (ra.ctype.split(';')[0] !== rb.ctype.split(';')[0]) detail = `ctype A=${ra.ctype} B=${rb.ctype}`
  else if (ra.ctype.includes('json')) detail = diffObj(ra, rb)
  else if (ra.ctype.includes('xml')) detail = canonXml(ra.text) !== canonXml(rb.text) ? `body 规范化后不一致` : null
  else if (ra.text !== norm(rb.text)) {
    if (ra.text === rb.text) detail = null
    else detail = `body A[${ra.text.length}]=${ra.text.slice(0, 80).replace(/\n/g, ' ')} | B[${rb.text.length}]=${rb.text.slice(0, 80).replace(/\n/g, ' ')}`
  } else detail = null
  const ok = !detail
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '\n      ' + detail : ''}`)
  return { ra, rb, ok }
}

// ===== 第一层：登录与鉴权 =====
await run('login-ok', { method: 'POST', path: '/enc-api/login', body: { username: 'admin', password: '123456' } })
await run('login-bad', { method: 'POST', path: '/enc-api/login', body: { username: 'admin', password: 'wrong' } })
await run('userinfo-noauth(401)', { path: '/enc-api/getUserInfo' })
await run('userinfo-auth', { path: '/enc-api/getUserInfo', headers: { AUTHORIZETOKEN: 'x' } })
await run('getalistconfig', { path: '/enc-api/getAlistConfig', headers: { AUTHORIZETOKEN: 'x' } })
await run('getwebdavonfig', { path: '/enc-api/getWebdavonfig', headers: { AUTHORIZETOKEN: 'x' } })

// ===== 第一层：alist API 拦截（文件名解密），基准路径 /aliyun/atest =====
await run('list-root', { method: 'POST', path: '/api/fs/list', auth: true, code200: true, body: { path: '/', page: 1, per_page: 0, password: '', refresh: false } })
await run('list-aliyun', { method: 'POST', path: '/api/fs/list', auth: true, code200: true, body: { path: '/aliyun', page: 1, per_page: 0, password: '', refresh: false } })
await run('list-aliyun-atest(aesctr)', { method: 'POST', path: '/api/fs/list', auth: true, code200: true, body: { path: '/aliyun/atest', page: 1, per_page: 0, password: '', refresh: false } })

// ===== 第一层：webdav =====
await run('propfind-dav-d0', { method: 'PROPFIND', path: '/dav/', headers: { Depth: '0' } })
await run('propfind-dav-d1', { method: 'PROPFIND', path: '/dav/', headers: { Depth: '1' } })
// 深路径 PROPFIND 透传上游需 Basic 凭据（不带则上游 401 空 body，仅剩 koa 补头差异）
await run('propfind-aliyun-atest-d1', { method: 'PROPFIND', path: '/dav/aliyun/atest/', headers: { Depth: '1', Authorization: 'Basic ' + Buffer.from('admin:123456').toString('base64') } })

// ===== 第一层：HTML 注入与静态 =====
await run('html-inject', { path: '/' })
await run('static-logo', { path: '/public/logo.png' })

console.log(results.join('\n'))
const fail = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n===== ${results.length - fail}/${results.length} PASS =====`)
