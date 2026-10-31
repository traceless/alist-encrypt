// WebDAV PROPFIND 面向的轻量 XML 解析器（零依赖，替换 fast-xml-parser）
// 对齐 fast-xml-parser v4 实测行为：
//   removeNSPrefix / 纯数字文本转 number（'1e5' 等科学计数保持字符串）/
//   实体解码 / 文本 trim / <?xml?> 声明输出 '?xml':'' /
//   同名兄弟节点 1 个→对象 多个→数组 / 空元素→'' / 混合内容挂 #text
// 与 fxp 的刻意差异：解析失败返回 {} 而非抛错
//   （webdavClient 路径：{} → 属性访问抛 TypeError → 既有 catch 接住，等价；
//    encDavHandle 路径：multistatus undefined → 走 404 原文分支，代理透明性更优）
// 仅支持 parse（项目内 XML 重写全部走字符串 replace，无序列化需求）
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const NUMERIC_RE = /^-?\d+(\.\d+)?$/
const NS_PREFIX_RE = /^[A-Za-z_][\w.-]*:/

// fxp 实测：仅解码 5 个命名实体，数字实体（&#65;/&#x42;）保持原样
function decodeEntities(str) {
  return str.replace(/&(#x?[0-9a-fA-F]+|[A-Za-z][A-Za-z0-9]*);/g, (m, body) => {
    if (body[0] === '#') {
      return m
    }
    return Object.hasOwn(ENTITIES, body) ? ENTITIES[body] : m
  })
}

// fast-xml-parser（strnum）行为：纯数字文本转 number，其余保持字符串
function toValue(text) {
  return NUMERIC_RE.test(text) ? Number(text) : text
}

// 找标签结束 '>'，跳过属性值引号内内容
function findTagEnd(xml, start) {
  let quote = null
  for (let i = start; i < xml.length; i++) {
    const ch = xml[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '>') {
      return i
    }
  }
  throw new Error('unclosed tag')
}

function parseDoc(xml) {
  let i = 0
  const n = xml.length
  const root = {}
  // 栈条目：parent=父对象引用，name=元素名，node=本元素对象，textVal=已解码文本累积
  const stack = [{ parent: null, name: null, node: root, textVal: '' }]
  let textBuf = ''

  const consumeText = () => {
    if (!textBuf) return
    const seg = decodeEntities(textBuf).trim()
    textBuf = ''
    if (seg) stack[stack.length - 1].textVal += seg
  }

  // 元素定型：无子元素→标量；仅文本→标量；有子元素+文本→挂 #text（fxp 键序：#text 在后）
  const finalize = (top) => {
    const node = top.node
    if (!node || typeof node !== 'object') return
    const keys = Object.keys(node)
    if (keys.length === 0) {
      const val = top.textVal ? toValue(top.textVal) : ''
      const cur = top.parent[top.name]
      if (cur === node) {
        top.parent[top.name] = val
      } else if (Array.isArray(cur)) {
        const idx = cur.indexOf(node)
        if (idx !== -1) cur[idx] = val
      }
    } else if (keys.length === 1 && keys[0] === '#text') {
      const val = toValue(node['#text'])
      const cur = top.parent[top.name]
      if (cur === node) {
        top.parent[top.name] = val
      } else if (Array.isArray(cur)) {
        const idx = cur.indexOf(node)
        if (idx !== -1) cur[idx] = val
      }
    } else if (top.textVal && !Object.hasOwn(node, '#text')) {
      node['#text'] = toValue(top.textVal)
    }
  }

  while (i < n) {
    const lt = xml.indexOf('<', i)
    if (lt === -1) {
      textBuf += xml.slice(i)
      break
    }
    textBuf += xml.slice(i, lt)

    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4)
      if (end === -1) throw new Error('unclosed comment')
      i = end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      consumeText()
      const end = xml.indexOf(']]>', lt + 9)
      if (end === -1) throw new Error('unclosed cdata')
      // CDATA 内容不解码、不 trim（fxp 行为）
      stack[stack.length - 1].textVal += xml.slice(lt + 9, end)
      i = end + 3
      continue
    }
    if (xml.startsWith('<?', lt)) {
      consumeText()
      const end = xml.indexOf('?>', lt + 2)
      if (end === -1) throw new Error('unclosed pi')
      // fxp 实测：<?xml ...?> 输出 '?xml':''
      const rawName = xml
        .slice(lt + 2, end)
        .trim()
        .split(/\s+/)[0]
      root['?' + rawName.replace(NS_PREFIX_RE, '')] = ''
      i = end + 2
      continue
    }
    if (xml.startsWith('<!', lt)) {
      // DOCTYPE 等声明：消费侧不可见，跳过
      const end = findTagEnd(xml, lt + 2)
      i = end + 1
      continue
    }
    if (xml.startsWith('</', lt)) {
      consumeText()
      const gt = xml.indexOf('>', lt + 2)
      if (gt === -1) throw new Error('unclosed end tag')
      const top = stack.pop()
      if (stack.length === 0) throw new Error('unbalanced tags')
      finalize(top)
      i = gt + 1
      continue
    }

    // 开标签或自闭合标签
    consumeText()
    const gt = findTagEnd(xml, lt + 1)
    const selfClosing = xml[gt - 1] === '/'
    const rawName = xml
      .slice(lt + 1, selfClosing ? gt - 1 : gt)
      .trim()
      .split(/\s+/)[0]
    const name = rawName.replace(NS_PREFIX_RE, '')
    if (!name) throw new Error('invalid tag name')
    const top = stack[stack.length - 1]
    const child = selfClosing ? '' : {}
    const existing = top.node[name]
    if (existing === undefined) {
      top.node[name] = child
    } else if (Array.isArray(existing)) {
      existing.push(child)
    } else {
      top.node[name] = [existing, child]
    }
    if (!selfClosing) {
      const nodeVal = top.node[name]
      const nodeRef = Array.isArray(nodeVal) ? nodeVal[nodeVal.length - 1] : nodeVal
      stack.push({ parent: top.node, name, node: nodeRef, textVal: '' })
    }
    i = gt + 1
  }
  consumeText()
  if (stack.length !== 1) throw new Error('unbalanced tags')
  return root
}

/**
 * 解析 XML，等价 new XMLParser({ removeNSPrefix: true }).parse(str)
 * @param {string} xmlStr XML 文本
 * @returns {object} 解析结果；输入非法或解析失败时返回 {}
 */
export function parseXml(xmlStr) {
  if (typeof xmlStr !== 'string' || xmlStr.length === 0) {
    return {}
  }
  try {
    return parseDoc(xmlStr)
  } catch (e) {
    return {}
  }
}
