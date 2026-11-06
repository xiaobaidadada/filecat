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

export type format_name = 'json' | 'yaml' | 'toml' | 'xml'

/** 各格式在 Ace 编辑器里对应的语法高亮 mode */
export const format_mode: Record<format_name, string> = {
  json: 'json',
  yaml: 'yaml',
  toml: 'toml',
  xml: 'xml'
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
