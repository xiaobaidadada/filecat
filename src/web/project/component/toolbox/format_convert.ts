import * as yaml from 'js-yaml'
import {parse as toml_parse, stringify as toml_stringify} from 'smol-toml'
import {XMLBuilder, XMLParser} from 'fast-xml-parser'

/**
 * 结构化数据格式互转内核。
 *
 * 四种格式（json / yaml / toml / xml）先统一解析成普通 JS 对象，
 * 再序列化成目标格式，因此只需要 N 个解析器 + N 个序列化器，
 * 不需要为每两种格式写一对转换函数。
 */

export type format_name = 'json' | 'yaml' | 'toml' | 'xml' | 'properties'

/** 各格式在 Ace 编辑器里对应的语法高亮 mode */
export const format_mode: Record<format_name, string> = {
  json: 'json',
  yaml: 'yaml',
  toml: 'toml',
  xml: 'xml',
  properties: 'properties'
}

/** XML 解析时给属性、文本节点用前缀，避免和普通子节点重名 */
const ATTR_PREFIX = '@_'
const TEXT_KEY = '#text'

const xml_parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  textNodeName: TEXT_KEY,
  // 保留原始值类型（数字/布尔），否则转成 json 后全是字符串
  parseAttributeValue: true,
  parseTagValue: true,
  trimValues: true,
  // 单个子节点也统一成数组的开关关掉：非数组更贴近直觉，需要数组由用户自己决定
  isArray: () => false
})

const xml_builder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: ATTR_PREFIX,
  textNodeName: TEXT_KEY,
  format: true,
  indentBy: '  ',
  suppressEmptyNode: true
})

/**
 * Properties 文本解析成扁平对象。
 *
 * 规则按 java.util.Properties 的实际行为：
 *   - # 与 ! 开头为注释
 *   - 分隔符支持 = 与 :（取先出现的那个）
 *   - 行尾反斜杠为续行
 *   - \uXXXX 转义为对应字符
 *
 * 只做单层 key=value，点号（a.b.c）不展开成嵌套对象 ——
 * 展开会丢失原始层级信息，转回 properties 时无法还原。
 */
function parse_properties(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  // 先把续行合并：行尾单个反斜杠表示下一行是延续
  const logical: string[] = []
  let buf = ''
  for (const raw of text.split(/\r?\n/)) {
    if (buf === '' && raw.trim() === '') continue
    const line = buf + raw
    // 偶数个反斜杠结尾表示转义，奇数个才是续行
    const m = line.match(/\\+$/)
    const is_continue = m !== null && m[0].length % 2 === 1
    if (is_continue) {
      buf = line.slice(0, -1)
      continue
    }
    logical.push(line)
    buf = ''
  }
  if (buf !== '') logical.push(buf)

  for (const line of logical) {
    const trimmed = line.trimStart()
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
    // 找第一个未转义的 = 或 :
    let sep = -1
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '\\') {
        i++
        continue
      }
      if (c === '=' || c === ':') {
        sep = i
        break
      }
    }
    const raw_key = sep === -1 ? line : line.slice(0, sep)
    const raw_value = sep === -1 ? '' : line.slice(sep + 1)
    const key = unescape_properties(raw_key.trim())
    if (key === '') continue
    out[key] = unescape_properties(raw_value.trim())
  }
  return out
}

/** 还原 properties 转义：\uXXXX、\n、\t、\\ 等 */
function unescape_properties(s: string): string {
  return s.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_m, g: string) => {
    if (g[0] === 'u') return String.fromCharCode(parseInt(g.slice(1), 16))
    if (g === 'n') return '\n'
    if (g === 't') return '\t'
    if (g === 'r') return '\r'
    return g
  })
}

/** 序列化时需要的转义，保证 key / value 能还原 */
function escape_properties(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
}

/**
 * 把对象序列化成 properties 文本。
 *
 * 支持的嵌套按 a.b.c 形式拍平（反方向解析不展开，所以这里只做输出）。
 * 值为 null/undefined 的键跳过；数组按下标 0.1.2 拍平。
 */
function stringify_properties(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    throw new Error('Properties 顶层必须是对象，无法转换标量')
  }
  const lines: string[] = []
  const walk = (node: unknown, prefix: string) => {
    if (node === null || node === undefined) return
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, prefix === '' ? String(i) : `${prefix}.${i}`))
      return
    }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, prefix === '' ? k : `${prefix}.${k}`)
      }
      return
    }
    if (prefix === '') return
    lines.push(`${escape_properties(prefix)}=${escape_properties(String(node))}`)
  }
  walk(value, '')
  return lines.join('\n')
}

/**
 * 把源文本解析成普通 JS 值。
 * 解析失败直接抛出，由调用方展示错误信息。
 */
export function parse_text(text: string, format: format_name): unknown {
  if (text.trim() === '') return null
  if (format === 'json') {
    return JSON.parse(text)
  }
  if (format === 'yaml') {
    return yaml.load(text)
  }
  if (format === 'toml') {
    return toml_parse(text)
  }
  if (format === 'properties') {
    return parse_properties(text)
  }
  // xml 解析结果顶层是「根标签名 -> 内容」，这里原样保留，
  // 因为转成其它格式时根标签名本身就是用户数据的一部分
  const parsed = xml_parser.parse(text) as Record<string, unknown>
  // 去掉 <?xml ...?> 声明，它不是用户数据
  if (parsed && typeof parsed === 'object') delete parsed['?xml']
  return parsed
}

/**
 * 把 JS 值序列化成目标格式文本。
 */
export function stringify_value(value: unknown, format: format_name): string {
  if (format === 'json') {
    return JSON.stringify(value, null, 2)
  }
  if (format === 'yaml') {
    return yaml.dump(value, {indent: 2, lineWidth: -1, noRefs: true})
  }
  if (format === 'toml') {
    // TOML 顶层必须是对象，标量无法表达
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('TOML 顶层必须是对象，无法转换标量或数组')
    }
    return toml_stringify(value as Record<string, unknown>)
  }
  if (format === 'properties') {
    return stringify_properties(value)
  }
  if (value === null || typeof value !== 'object') {
    throw new Error('XML 顶层必须是对象，无法转换标量')
  }
  // XML 只允许一个根节点
  if (Array.isArray(value)) {
    throw new Error('XML 顶层必须是对象，无法转换数组')
  }
  const keys = Object.keys(value as Record<string, unknown>)
  // 顶层是单个键时，它本身就是根标签，直接用
  if (keys.length === 1) {
    return xml_builder.build(value)
  }
  // 多个顶层键无法构成合法 XML（XML 只允许一个根节点），统一包一层 root
  return xml_builder.build({root: value})
}

/** 源文本直接转换到目标格式 */
export function convert_text(text: string, from: format_name, to: format_name): string {
  if (from === to) {
    // 同格式也走一遍解析 + 序列化，效果就是「格式化」
    return stringify_value(parse_text(text, from), to)
  }
  return stringify_value(parse_text(text, from), to)
}
