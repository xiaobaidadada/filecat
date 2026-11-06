import {md5} from 'js-md5'

/**
 * 摘要算法。SHA 系列走浏览器原生 crypto.subtle（异步），
 * MD5 不在 WebCrypto 标准里，用 js-md5 补充。
 */

export type hash_name = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512'

export const hash_list: { label: string, value: hash_name }[] = [
  {label: 'MD5', value: 'md5'},
  {label: 'SHA-1', value: 'sha1'},
  {label: 'SHA-256', value: 'sha256'},
  {label: 'SHA-384', value: 'sha384'},
  {label: 'SHA-512', value: 'sha512'}
]

const subtle_name: Record<hash_name, string> = {
  md5: 'MD5',
  sha1: 'SHA-1',
  sha256: 'SHA-256',
  sha384: 'SHA-384',
  sha512: 'SHA-512'
}

function buffer_to_hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 计算摘要，返回小写十六进制 */
export async function hash_text(text: string, name: hash_name): Promise<string> {
  if (name === 'md5') {
    return md5(text)
  }
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest(subtle_name[name], data)
  return buffer_to_hex(digest)
}

/** 一次性算出全部摘要，省得用户逐个点 */
export async function hash_all(text: string): Promise<Record<hash_name, string>> {
  const entries = await Promise.all(
    hash_list.map(async it => [it.value, await hash_text(text, it.value)] as const)
  )
  return Object.fromEntries(entries) as Record<hash_name, string>
}
