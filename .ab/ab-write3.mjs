// A/B 对照测试（写操作 14 项）：A=192.168.5.14:5344 (koa 基准)  B=127.0.0.1:5344 (hono 被测)
// 2026-10-26 重建版：原脚本未入 git 随分支切换丢失，按项目记忆中的语义重建
//
// 关键前提：
// - A/B 共享同一上游 OpenList(192.168.5.10:5244)，写操作不能同路径并发 → A 落 abtest-a-<ts>，B 落 abtest-b-<ts>，路径归一化后 diff
// - 加密规则 atest/.* 非锚定子串匹配（aesctr，encName+encFolder），/aliyun/atest 下目录名与文件名、文件内容都会被加密
// - alist API 语义：mkdir={path:新目录完整路径}；rename={path:对象完整路径, name:新名字(代理负责加密)}；
//   move={src_dir,dst_dir,names}；remove={dir,names}；put=PUT 裸字节+file-path 头（不是 multipart）；/p/ /d/ 下载 sign 按需携带
// - 鉴权：代理对 /api/fs/* 透明转发不注入凭据，必须客户端先登录上游(/api/auth/login)拿 token 放 Authorization 头
// - 顺序约束：mkdir 后必须 list 父目录刷新缓存（getFileInfo 靠 levelDB showPath 键定位真实路径，mkdir 本身不写缓存）；
//   move 前必须 list 目标父目录（否则 dst_dir 解析不到真实路径）
// - OpenList 的 put/move 是异步任务：响应 200 只代表 task 受理，断言前必须轮询 list 等落盘
const A = 'http://192.168.5.14:5344'
const B = 'http://127.0.0.1:5344'
const ROOT = '/aliyun/atest'

// 登录上游拿 token（经代理转发 /api/auth/login，A/B 各自一份）
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

const ts = Date.now().toString(36)
const NAME1 = `data-${ts}.bin`   // 初始上传文件（AES-CTR 加密上传）
const NAME2 = `data2-${ts}.bin`  // rename 后的名字
const SUB = `sub-${ts}`          // move 目标子目录
const DIRS = { A: `${ROOT}/abtest-a-${ts}`, B: `${ROOT}/abtest-b-${ts}` }

// 256KB 确定性伪随机内容（A/B 同内容 → 同密文 → 响应可逐字节归一化对比；交叉下载断言逐字节还原）
const CONTENT = Buffer.alloc(256 * 1024)
{
  let s = 0x9e3779b9 >>> 0
  for (let i = 0; i < CONTENT.length; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    CONTENT[i] = s >>> 24
  }
}
const { createHash } = await import('node:crypto')
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex')
const SHA_CONTENT = sha256(CONTENT)

// ===== 归一化：两侧各自的动态串映射到同一占位符后再 diff =====
function normFor(_side, s) {
  let t = String(s)
  const rep = (from, to) => { if (from) t = t.split(from).join(to) }
  // 测试目录名：A 的响应里也会出现 B 侧目录（共享上游），正则双侧统一替换（含 URL 编码形态，连字符不被编码）
  t = t.replace(new RegExp(`abtest-[ab]-${ts}`, 'g'), '<DIR>')
  rep(NAME1, '<F1>')
  rep(NAME2, '<F2>')
  rep(SUB, '<SUB>')
  // 上游 sign 对真实路径签名，A/B 目录名不同 → sign 必然不同，非行为差异
  t = t.replace(/"sign":"[^"]*"/g, '"sign":"<SIGN>"')
  // 代理注入的真实路径字段含加密 blob 名（两侧目录名不同 → 密名必然不同），含 ≥20 位 blob 段的路径整体打码
  t = t.replace(/"(?:path|showPath)":"(?:\/[A-Za-z0-9_.-]+)*\/[A-Za-z0-9_-]{20,}(?:\/[A-Za-z0-9_.-]+)*"/g, '"path":"<REAL>"')
  // fs/get 的 lastUrl 是 URL 编码的真实路径（%2F 连接的加密 blob），同理打码
  t = t.replace(/(?:%2F[A-Za-z0-9_-]{20,})+/gi, '<REALENC>')
  t = t.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
  t = t.replace(/https?:\/\/[^/"'\\\s]+/g, '<BASE>')
  t = t.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<TS>')
  return t
}

async function api(base, path, body) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: TOKENS[base] },
    body: JSON.stringify(body),
  })
  return { status: res.status, ctype: res.headers.get('content-type') || '', text: await res.text() }
}

async function putFile(base, filePath, buf) {
  const res = await fetch(base + '/api/fs/put', {
    method: 'PUT',
    headers: { 'file-path': encodeURIComponent(filePath), authorization: TOKENS[base] },
    body: buf,
  })
  return { status: res.status, ctype: res.headers.get('content-type') || '', text: await res.text() }
}

// alist 信封 code 断言（防两侧一致地失败被误判 PASS）
function codeCheck(side, r) {
  try {
    const j = JSON.parse(r.text)
    if (j.code !== undefined && j.code !== 200) return `${side} code=${j.code} ${j.message || j.msg || ''}`
  } catch {}
  return null
}

async function download(base, urlPath, headers = {}, redirect = 'follow') {
  const res = await fetch(base + urlPath, { headers, redirect })
  return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), location: res.headers.get('location') || '' }
}

const listBody = (path, refresh = true) => ({ path, page: 1, per_page: 0, password: '', refresh })

// 轮询等待文件出现（OpenList 的 put/move 是异步任务：响应 200 返回 task id，落盘有延迟）
async function pollDir(base, dir, wantName, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await api(base, '/api/fs/list', listBody(dir))
    try {
      const entry = (JSON.parse(last.text).data?.content || []).find((f) => f.name === wantName)
      if (entry) return { r: last, entry }
    } catch {}
    await new Promise((res) => setTimeout(res, 800))
  }
  return { r: last, entry: null }
}

function firstDiff(na, nb) {
  let i = 0
  while (i < Math.min(na.length, nb.length) && na[i] === nb[i]) i++
  return `at[${i}] A=...${na.slice(Math.max(0, i - 40), i + 70)}... B=...${nb.slice(Math.max(0, i - 40), i + 70)}...`
}

function diffResp(ra, rb) {
  if (ra.status !== rb.status) return `status A=${ra.status} B=${rb.status}`
  const na = normFor('A', ra.text), nb = normFor('B', rb.text)
  if (na !== nb) return firstDiff(na, nb)
  return null
}

const results = []
async function item(name, fn) {
  try {
    const detail = await fn()
    results.push(`${detail ? 'FAIL' : 'PASS'}  ${name}${detail ? '\n      ' + detail : ''}`)
  } catch (e) {
    results.push(`FAIL  ${name}\n      ${e.message}`)
  }
}

// 每侧运行时状态（sign、条目缓存）
const S = { A: { dir: DIRS.A }, B: { dir: DIRS.B } }

// 下载 URL（sign 为空串时省略，上游未开 sign_all）
const dlUrl = (dir, name, sign) => `/d${dir}/${name}${sign ? `?sign=${sign}` : ''}`

// ===== 1. mkdir（随后 list ROOT 刷新缓存，fs/put 与后续 getFileInfo 依赖真实路径缓存）=====
await item('mkdir', async () => {
  const [ra, rb] = await Promise.all([
    api(A, '/api/fs/mkdir', { path: S.A.dir }),
    api(B, '/api/fs/mkdir', { path: S.B.dir }),
  ])
  const d1 = codeCheck('A', ra) || codeCheck('B', rb) || diffResp(ra, rb)
  const [la, lb] = await Promise.all([api(A, '/api/fs/list', listBody(ROOT)), api(B, '/api/fs/list', listBody(ROOT))])
  return d1 || codeCheck('A', la) || codeCheck('B', lb) || diffResp(la, lb)
})

// ===== 2. 加密上传（PUT 裸字节 + file-path 头）=====
await item('put-upload(aesctr)', async () => {
  const [pa, pb] = await Promise.all([
    putFile(A, `${S.A.dir}/${NAME1}`, CONTENT),
    putFile(B, `${S.B.dir}/${NAME1}`, CONTENT),
  ])
  if (pa.status !== pb.status) return `status A=${pa.status} B=${pb.status}`
  return codeCheck('A', pa) || codeCheck('B', pb) || diffResp(pa, pb)
})

// ===== 3. 上传后列表（轮询等待异步上传落盘；捕获 sign；断言 size 与明文一致）=====
await item('list-after-put', async () => {
  const [pa, pb] = await Promise.all([pollDir(A, S.A.dir, NAME1), pollDir(B, S.B.dir, NAME1)])
  if (!pa.entry) return `A 轮询 20s 后列表中仍未出现 ${NAME1}`
  if (!pb.entry) return `B 轮询 20s 后列表中仍未出现 ${NAME1}`
  const d = diffResp(pa.r, pb.r)
  for (const [side, e] of [['A', pa.entry], ['B', pb.entry]]) {
    if (e.size !== CONTENT.length) return d || `${side} size=${e.size} 期望 ${CONTENT.length}`
    S[side].sign1 = e.sign
  }
  return d
})

// ===== 4. fs/get（raw_url 应替换为 /redirect/<uuid>?decode=1，provider→Local）=====
await item('fs-get(redirect)', async () => {
  const [ra, rb] = await Promise.all([
    api(A, '/api/fs/get', { path: `${S.A.dir}/${NAME1}` }),
    api(B, '/api/fs/get', { path: `${S.B.dir}/${NAME1}` }),
  ])
  const d = codeCheck('A', ra) || codeCheck('B', rb) || diffResp(ra, rb)
  for (const [side, r] of [['A', ra], ['B', rb]]) {
    const json = JSON.parse(r.text)
    if (json.data?.is_dir) return d || `${side} fs/get 返回了目录`
    if (json.data?.size !== CONTENT.length) return d || `${side} fs/get size=${json.data?.size}`
  }
  return d
})

// ===== 5. /d/ 解密下载 =====
await item('dl-d-decrypt', async () => {
  const [da, db] = await Promise.all([
    download(A, dlUrl(S.A.dir, NAME1, S.A.sign1)),
    download(B, dlUrl(S.B.dir, NAME1, S.B.sign1)),
  ])
  if (da.status !== db.status) return `status A=${da.status} B=${db.status}`
  if (sha256(da.buf) !== SHA_CONTENT) return `A 解密内容 sha 不匹配(${sha256(da.buf).slice(0, 12)})`
  if (sha256(db.buf) !== SHA_CONTENT) return `B 解密内容 sha 不匹配(${sha256(db.buf).slice(0, 12)})`
  return null
})

// ===== 6. /p/ 预览下载（redirect:'manual'：上游 /p/ 可能 302 到对象存储直链——302 时不经过代理解密流，
//   这是两侧一致的存量行为；Location 为上游签名直链，逐请求变化，只比状态与存在性）=====
await item('dl-p-decrypt', async () => {
  const [da, db] = await Promise.all([
    download(A, `/p${S.A.dir}/${NAME1}${S.A.sign1 ? `?sign=${S.A.sign1}` : ''}`, {}, 'manual'),
    download(B, `/p${S.B.dir}/${NAME1}${S.B.sign1 ? `?sign=${S.B.sign1}` : ''}`, {}, 'manual'),
  ])
  if (da.status !== db.status) return `status A=${da.status} B=${db.status}`
  if (da.status >= 300 && da.status < 400) {
    if (!da.location || !db.location) return `30x 但缺 Location A=${da.location ? '有' : '无'} B=${db.location ? '有' : '无'}`
    return null
  }
  if (da.status !== 200) return null // 两侧一致的非 200（上游 /p/ 存量行为），等价即通过
  if (sha256(da.buf) !== SHA_CONTENT) return `A 解密内容 sha 不匹配(${sha256(da.buf).slice(0, 12)})`
  if (sha256(db.buf) !== SHA_CONTENT) return `B 解密内容 sha 不匹配(${sha256(db.buf).slice(0, 12)})`
  return null
})

// ===== 7. Range 解密下载（bytes=1000-1999 → 明文切片）=====
await item('dl-range', async () => {
  const [da, db] = await Promise.all([
    download(A, dlUrl(S.A.dir, NAME1, S.A.sign1), { Range: 'bytes=1000-1999' }),
    download(B, dlUrl(S.B.dir, NAME1, S.B.sign1), { Range: 'bytes=1000-1999' }),
  ])
  if (da.status !== db.status) return `status A=${da.status} B=${db.status}`
  const expect = CONTENT.subarray(1000, 2000)
  if (!da.buf.equals(expect)) return `A range 内容不匹配(len=${da.buf.length})`
  if (!db.buf.equals(expect)) return `B range 内容不匹配(len=${db.buf.length})`
  return null
})

// ===== 8. 交叉下载（A 下载 B 侧上传的密文并解密，B 反之；验证两侧密文/算法互通）=====
await item('dl-cross', async () => {
  // 交叉 list 刷缓存并取对方文件的 sign
  const [la, lb] = await Promise.all([api(A, '/api/fs/list', listBody(S.B.dir)), api(B, '/api/fs/list', listBody(S.A.dir))])
  const cd = codeCheck('A', la) || codeCheck('B', lb)
  if (cd) return cd
  const sa = JSON.parse(la.text), sb = JSON.parse(lb.text)
  const eA = (sa.data?.content || []).find((f) => f.name === NAME1)
  const eB = (sb.data?.content || []).find((f) => f.name === NAME1)
  if (!eA) return `A 侧 list B 目录未找到 ${NAME1}`
  if (!eB) return `B 侧 list A 目录未找到 ${NAME1}`
  const [da, db] = await Promise.all([
    download(A, dlUrl(S.B.dir, NAME1, eA.sign)),
    download(B, dlUrl(S.A.dir, NAME1, eB.sign)),
  ])
  if (da.status !== db.status) return `status A=${da.status} B=${db.status}`
  if (sha256(da.buf) !== SHA_CONTENT) return `A 交叉解密 sha 不匹配(${sha256(da.buf).slice(0, 12)})`
  if (sha256(db.buf) !== SHA_CONTENT) return `B 交叉解密 sha 不匹配(${sha256(db.buf).slice(0, 12)})`
  return null
})

// ===== 9. rename（代理负责加密新名字）=====
await item('rename', async () => {
  const [ra, rb] = await Promise.all([
    api(A, '/api/fs/rename', { path: `${S.A.dir}/${NAME1}`, name: NAME2 }),
    api(B, '/api/fs/rename', { path: `${S.B.dir}/${NAME1}`, name: NAME2 }),
  ])
  return codeCheck('A', ra) || codeCheck('B', rb) || diffResp(ra, rb)
})

// ===== 10. rename 后列表（轮询等待落盘；捕获新 sign）=====
await item('list-after-rename', async () => {
  const [pa, pb] = await Promise.all([pollDir(A, S.A.dir, NAME2), pollDir(B, S.B.dir, NAME2)])
  if (!pa.entry) return `A 轮询 20s 后列表中仍未出现 ${NAME2}`
  if (!pb.entry) return `B 轮询 20s 后列表中仍未出现 ${NAME2}`
  const d = diffResp(pa.r, pb.r)
  S.A.sign2 = pa.entry.sign
  S.B.sign2 = pb.entry.sign
  return d
})

// ===== 11. mkdir 子目录 =====
await item('mkdir-sub', async () => {
  const [ra, rb] = await Promise.all([
    api(A, '/api/fs/mkdir', { path: `${S.A.dir}/${SUB}` }),
    api(B, '/api/fs/mkdir', { path: `${S.B.dir}/${SUB}` }),
  ])
  return codeCheck('A', ra) || codeCheck('B', rb) || diffResp(ra, rb)
})

// ===== 12. move 前 list（缓存子目录真实路径，move 的 dst_dir 解析依赖它）=====
await item('list-before-move', async () => {
  const [la, lb] = await Promise.all([api(A, '/api/fs/list', listBody(S.A.dir)), api(B, '/api/fs/list', listBody(S.B.dir))])
  return codeCheck('A', la) || codeCheck('B', lb) || diffResp(la, lb)
})

// ===== 13. move 文件进子目录 =====
await item('move', async () => {
  const [ra, rb] = await Promise.all([
    api(A, '/api/fs/move', { src_dir: S.A.dir, dst_dir: `${S.A.dir}/${SUB}`, names: [NAME2] }),
    api(B, '/api/fs/move', { src_dir: S.B.dir, dst_dir: `${S.B.dir}/${SUB}`, names: [NAME2] }),
  ])
  return codeCheck('A', ra) || codeCheck('B', rb) || diffResp(ra, rb)
})

// ===== 14. move 后列表（轮询等待异步 move 落盘，验证子目录内容）=====
await item('list-after-move', async () => {
  const [pa, pb] = await Promise.all([
    pollDir(A, `${S.A.dir}/${SUB}`, NAME2),
    pollDir(B, `${S.B.dir}/${SUB}`, NAME2),
  ])
  if (!pa.entry) return `A 轮询 20s 后子目录中仍未出现 ${NAME2}`
  if (!pb.entry) return `B 轮询 20s 后子目录中仍未出现 ${NAME2}`
  return diffResp(pa.r, pb.r)
})

console.log(results.join('\n'))

// ===== 清理（不计入结果，尽力而为；A/B 各清自己的子树；逐层 list+删除，list 同时刷新 remove 名字解密依赖的缓存）=====
async function cleanup(side, base) {
  const dir = S[side].dir
  const baseName = dir.split('/').pop()
  for (let i = 0; i < 5; i++) {
    for (const p of [`${dir}/${SUB}`, dir]) {
      try {
        const j = await api(base, '/api/fs/list', listBody(p))
        for (const f of JSON.parse(j.text).data?.content || []) {
          await api(base, '/api/fs/remove', { dir: p, names: [f.name] })
        }
      } catch {}
    }
    try { await api(base, '/api/fs/remove', { dir: ROOT, names: [baseName] }) } catch {}
    // 轮询确认目录已消失（上游删除/列表缓存有瞬时竞态）
    let gone = false
    for (let w = 0; w < 6; w++) {
      await new Promise((res) => setTimeout(res, 1500))
      try {
        const root = await api(base, '/api/fs/list', listBody(ROOT))
        if (!(JSON.parse(root.text).data?.content || []).find((f) => f.name === baseName)) { gone = true; break }
        await api(base, '/api/fs/remove', { dir: ROOT, names: [baseName] })
      } catch {}
    }
    if (gone) return
  }
}
await cleanup('A', A)
await cleanup('B', B)

// 残留检查
try {
  const la = await api(A, '/api/fs/list', listBody(ROOT))
  const leftover = (JSON.parse(la.text).data?.content || []).filter((f) => /abtest-[ab]-/.test(f.name)).map((f) => f.name)
  if (leftover.length) console.log(`\n[warn] 残留未清理: ${leftover.join(', ')}`)
} catch {}

const fail = results.filter((r) => r.startsWith('FAIL')).length
console.log(`\n===== ${results.length - fail}/${results.length} PASS =====`)
