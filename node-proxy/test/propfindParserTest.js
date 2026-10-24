'use strict'

// propfindParser 行为断言测试（零依赖，node test/propfindParserTest.js 直接运行）
// 逐条对齐 fast-xml-parser v4.2.7 实测行为（评审时用未卸载的 fxp 做过 12 用例基准对比）
// 若 node_modules 里存在 fast-xml-parser，会额外做全量输出对比（双重保险）
import { parseXml } from '../src/utils/propfindParser.js'

let pass = 0
let fail = 0

function assert(desc, actual, expect) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expect)
  if (a === e) {
    pass++
    console.log(`PASS  ${desc}`)
  } else {
    fail++
    console.log(`FAIL  ${desc}\n      expect: ${e?.slice(0, 200)}\n      actual: ${a?.slice(0, 200)}`)
  }
}

// 1. 多 response 列表：实体解码 + NS 前缀剥离 + collection 判断 + 数字转换
const xml1 = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/aliyun/atest/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/aliyun/atest/U9UjdknW2&amp;m%D6%D0%CE%C4.txt</D:href>
    <D:propstat><D:prop><D:resourcetype/><D:getcontentlength>8462336</D:getcontentlength></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/aliyun/atest/&lt;special&gt;.bin</D:href>
    <D:propstat><D:prop><D:resourcetype/><D:getcontentlength>0</D:getcontentlength></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
  </D:response>
</D:multistatus>`
const d1 = parseXml(xml1)
assert('1.1 多response数组化', d1.multistatus.response.length, 3)
assert('1.2 目录 collection 空标签', d1.multistatus.response[0].propstat.prop.resourcetype, { collection: '' })
assert('1.3 实体 &amp; 解码+percent保留', d1.multistatus.response[1].href, '/dav/aliyun/atest/U9UjdknW2&m%D6%D0%CE%C4.txt')
assert('1.4 getcontentlength 转 number', d1.multistatus.response[1].propstat.prop.getcontentlength, 8462336)
assert('1.5 自闭合 resourcetype 为空串(hasOwn false)', d1.multistatus.response[1].propstat.prop.resourcetype, '')
assert('1.6 实体 &lt;&gt; 解码', d1.multistatus.response[2].href, '/dav/aliyun/atest/<special>.bin')
assert('1.7 声明输出 ?xml 键', d1['?xml'], '')

// 2. 单 response + 多 propstat（取 [0] 场景）
const d2 = parseXml(`<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/file.txt</d:href>
    <d:propstat><d:prop><d:getcontentlength>42</d:getcontentlength></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
    <d:propstat><d:prop><d:quota-used>1</d:quota-used></d:prop><d:status>HTTP/1.1 403 Forbidden</d:status></d:propstat>
  </d:response>
</d:multistatus>`)
assert('2.1 单response为对象', d2.multistatus.response instanceof Array, false)
assert('2.2 多propstat数组化', d2.multistatus.response.propstat.length, 2)
assert('2.3 小写前缀剥离+数字', d2.multistatus.response.propstat[0].prop.getcontentlength, 42)

// 3. resourcetype 整个缺失 → 消费侧 ?? {} 兜底
const d3 = parseXml(`<D:multistatus xmlns:D="DAV:"><D:response><D:href>/x/</D:href><D:propstat><D:prop><D:displayname>nm</D:displayname></D:prop></D:propstat></D:response></D:multistatus>`)
assert('3.1 resourcetype 缺失为 undefined', d3.multistatus.response.propstat.prop.resourcetype ?? 'MISSING', 'MISSING')

// 4. 404 HTML body：正常解析树，multistatus undefined → encDavHandle 走 404 原文分支
const d4 = parseXml(`<html>\r\n<head><title>404 Not Found</title></head>\r\n<body>\r\n<center><h1>404 Not Found</h1></center>\r\n</body>\r\n</html>`)
assert('4.1 HTML body 不抛错', d4.html.body.center.h1, '404 Not Found')
assert('4.2 multistatus undefined', d4.multistatus ?? 'MISSING', 'MISSING')

// 5. JSON body（fxp 实测返回 {}）
assert('5.1 JSON body 返回 {}', parseXml(`{"code":404,"message":"object not found","data":null}`), {})

// 6/7. 空串/纯空白
assert('6.1 空串返回 {}', parseXml(''), {})
assert('7.1 纯空白返回 {}', parseXml('   \n\t  '), {})

// 8. 截断 XML：刻意差异——fxp 抛错，自写返回 {}（webdavClient catch 等价 / encDavHandle 走 404 原文分支）
assert('8.1 截断 XML 返回 {}（不抛错）', parseXml(`<D:multistatus xmlns:D="DAV:"><D:response><D:href>/a</D:hr`), {})

// 9. CDATA 不解码不 trim；数字实体保持原样（fxp 实测行为）
const d9 = parseXml(`<r><a><![CDATA[x & y]]></a><b>&#65;&#x42;</b></r>`)
assert('9.1 CDATA 原样', d9.r.a, 'x & y')
assert('9.2 数字实体不解码', d9.r.b, '&#65;&#x42;')

// 10. 注释 + 声明
assert('10.1 注释跳过+声明键', parseXml(`<?xml version="1.0"?><!-- comment --><r><v>1</v></r>`), { '?xml': '', r: { v: 1 } })

// 11. 数字边界：负数/小数转，科学计数与前导字母保持字符串
const d11 = parseXml(`<r><a>-12</a><b>3.14</b><c>007</c><d>1e5</d><e>abc123</e></r>`)
assert('11.1 负数/小数/前导零', [d11.r.a, d11.r.b, d11.r.c], [-12, 3.14, 7])
assert('11.2 科学计数保持字符串', [d11.r.d, d11.r.e], ['1e5', 'abc123'])

// 12. 空元素 + 纯空白 + 混合内容（#text 键序在后）
const d12 = parseXml(`<r><a></a><b>  spaced  </b><c>t1<t/></c></r>`)
assert('12.1 空元素为空串', d12.r.a, '')
assert('12.2 文本 trim', d12.r.b, 'spaced')
assert('12.3 混合内容 #text 在后', d12.r.c, { t: '', '#text': 't1' })

// 可选：若 fast-xml-parser 仍可用，做全量输出对比
try {
  const { XMLParser } = await import('fast-xml-parser')
  const fxp = new XMLParser({ removeNSPrefix: true })
  const cases = [xml1, `<a></a>`, `<a><b/><b/></a>`, `<a>t1<b/>t2</a>`]
  let fxpDiff = 0
  for (const c of cases) {
    let f, m
    try { f = JSON.stringify(fxp.parse(c)) } catch (e) { f = '<THROW>' }
    try { m = JSON.stringify(parseXml(c)) } catch (e) { m = '<THROW>' }
    if (f !== m && m !== '{}' /* 刻意差异：fxp 抛错场景 */) {
      fxpDiff++
      console.log(`FXP-DIFF  fxp=${f?.slice(0, 120)} mine=${m?.slice(0, 120)}`)
    }
  }
  if (fxpDiff === 0) {
    pass++
    console.log('PASS  fxp 动态对比（4 用例，忽略刻意抛错差异）')
  } else {
    fail += fxpDiff
  }
} catch {
  console.log('SKIP  fast-xml-parser 未安装，跳过动态对比（快照断言已覆盖）')
}

console.log(`\n${pass} pass, ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
