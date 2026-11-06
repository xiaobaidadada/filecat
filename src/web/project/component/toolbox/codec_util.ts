/**
 * 编解码内核。全部纯函数，不依赖浏览器 API 之外的东西。
 */

/* ---------------- Base64 ---------------- */

/** 字符串按 UTF-8 转 Base64 */
export function to_base64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach(b => binary += String.fromCharCode(b))
  return btoa(binary)
}

/** Base64 解出 UTF-8 字符串 */
export function from_base64(text: string): string {
  const binary = atob(text.trim())
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

/* ---------------- Base32 ---------------- */

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function to_base32(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += BASE32_CHARS[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += BASE32_CHARS[(value << (5 - bits)) & 31]
  // RFC 4648 要求补齐到 8 的倍数
  while (out.length % 8 !== 0) out += '='
  return out
}

export function from_base32(text: string): string {
  const clean = text.trim().replace(/=+$/, '').toUpperCase()
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const ch of clean) {
    const idx = BASE32_CHARS.indexOf(ch)
    if (idx < 0) throw new Error(`非法的 Base32 字符：${ch}`)
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

/* ---------------- Hex ---------------- */

export function to_hex(text: string, upper = false, with_space = false): string {
  const bytes = new TextEncoder().encode(text)
  const parts: string[] = []
  bytes.forEach(b => {
    const h = b.toString(16).padStart(2, '0')
    parts.push(upper ? h.toUpperCase() : h)
  })
  return parts.join(with_space ? ' ' : '')
}

export function from_hex(text: string): string {
  const clean = text.replace(/[\s,]/g, '')
  if (clean.length % 2 !== 0) throw new Error('十六进制长度必须是偶数')
  if (!/^[0-9a-fA-F]*$/.test(clean)) throw new Error('包含非十六进制字符')
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16)
  }
  return new TextDecoder().decode(bytes)
}

/* ---------------- Unicode ---------------- */

/** 中文等非 ASCII 字符转 \\uXXXX，ASCII 原样保留 */
export function to_unicode(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0) as number
    if (code < 128) {
      out += ch
    } else if (code > 0xffff) {
      // 超过 BMP 的字符需要拆成代理对
      const high = Math.floor((code - 0x10000) / 0x400) + 0xd800
      const low = ((code - 0x10000) % 0x400) + 0xdc00
      out += '\\u' + high.toString(16).padStart(4, '0')
      out += '\\u' + low.toString(16).padStart(4, '0')
    } else {
      out += '\\u' + code.toString(16).padStart(4, '0')
    }
  }
  return out
}

export function from_unicode(text: string): string {
  return text.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
}

/* ---------------- URL ---------------- */

export function url_encode(text: string, component = true): string {
  return component ? encodeURIComponent(text) : encodeURI(text)
}

export function url_decode(text: string): string {
  return decodeURIComponent(text)
}

/* ---------------- ASCII ---------------- */

/** 字符转 ASCII 码，非 ASCII 字符按 UTF-8 字节输出 */
export function to_ascii_code(text: string, with_space = true): string {
  const bytes = new TextEncoder().encode(text)
  return Array.from(bytes).join(with_space ? ' ' : '')
}

export function from_ascii_code(text: string): string {
  const nums = text.split(/[\s,]+/).filter(s => s !== '')
  const bytes = new Uint8Array(nums.length)
  nums.forEach((n, i) => {
    const v = Number(n)
    if (!Number.isInteger(v) || v < 0 || v > 255) {
      throw new Error(`非法的 ASCII 码：${n}`)
    }
    bytes[i] = v
  })
  return new TextDecoder().decode(bytes)
}

/* ---------------- HTML 实体 ---------------- */

export function to_html_entity(text: string): string {
  return text.replace(/[\s\S]/g, ch => {
    const code = ch.codePointAt(0) as number
    return code > 127 ? `&#${code};` : ch
  })
}

export function from_html_entity(text: string): string {
  return text.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
}

/* ---------------- 统一调度 ---------------- */

export type codec_name = 'base64' | 'base32' | 'hex' | 'unicode' | 'url' | 'ascii' | 'html'

export const codec_list: { label: string, value: codec_name }[] = [
  {label: 'Base64', value: 'base64'},
  {label: 'Base32', value: 'base32'},
  {label: 'Hex', value: 'hex'},
  {label: 'Unicode', value: 'unicode'},
  {label: 'URL', value: 'url'},
  {label: 'ASCII', value: 'ascii'},
  {label: 'HTML 实体', value: 'html'}
]

/**
 * 编码。extra 用于 hex 是否大写/带空格这类细分选项。
 */
export function encode_text(text: string, codec: codec_name, upper_hex = false, space_hex = false): string {
  if (codec === 'base64') return to_base64(text)
  if (codec === 'base32') return to_base32(text)
  if (codec === 'hex') return to_hex(text, upper_hex, space_hex)
  if (codec === 'unicode') return to_unicode(text)
  if (codec === 'url') return url_encode(text)
  if (codec === 'ascii') return to_ascii_code(text, space_hex)
  return to_html_entity(text)
}

export function decode_text(text: string, codec: codec_name): string {
  if (codec === 'base64') return from_base64(text)
  if (codec === 'base32') return from_base32(text)
  if (codec === 'hex') return from_hex(text)
  if (codec === 'unicode') return from_unicode(text)
  if (codec === 'url') return url_decode(text)
  if (codec === 'ascii') return from_ascii_code(text)
  return from_html_entity(text)
}
