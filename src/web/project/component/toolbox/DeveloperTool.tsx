import React, {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {Column, Dashboard, Row} from '../../../meta/component/Dashboard'
import {Card} from '../../../meta/component/Card'
import {InputText, InputTextarea, Select} from '../../../meta/component/Input'
import {ActionButton, ButtonText} from '../../../meta/component/Button'
import {NotyFail} from '../../util/noty'
import {copyToClipboard} from '../../util/FunUtil'

/* ---------------- 时间戳 ---------------- */

/** 秒/毫秒自动识别：10 位当秒，13 位当毫秒 */
function parse_timestamp(v: string): Date | null {
  const n = Number(v.trim())
  if (!Number.isFinite(n) || n <= 0) return null
  // 小于 1e11 视为秒级（约 5138 年以内）
  return new Date(n < 1e11 ? n * 1000 : n)
}

function format_date(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
    + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function TimeCard() {
  const {t} = useTranslation()
  const [ts, set_ts] = useState(String(Math.floor(Date.now() / 1000)))
  const [date_text, set_date_text] = useState('')

  const d = parse_timestamp(ts)
  const now = new Date()

  const ts_to_date = d ? format_date(d) : t('无效时间戳')

  const date_to_ts = () => {
    const parsed = new Date(date_text.trim().replace(' ', 'T'))
    if (isNaN(parsed.getTime())) {
      NotyFail(t('无法识别的日期格式，示例：2024-01-01 12:00:00'))
      return
    }
    set_ts(String(Math.floor(parsed.getTime() / 1000)))
  }

  return (
    <Card title={t('时间转换')}>
      <div className={'div-row'} style={{alignItems: 'center', gap: '0.5em', flexWrap: 'wrap'}}>
        <span className={'toolbox-label'}>{t('时间戳')}</span>
        <InputText width={'14em'} value={ts} placeholder={t('秒或毫秒')} handleInputChange={set_ts}/>
        <ButtonText text={t('现在')} clickFun={() => set_ts(String(Math.floor(Date.now() / 1000)))}/>
      </div>
      <div className={'toolbox-kv'}>
        <span>{t('秒级')}</span><span className={'toolbox-mono'}>{d ? Math.floor(d.getTime() / 1000) : '-'}</span>
        <span>{t('毫秒级')}</span><span className={'toolbox-mono'}>{d ? d.getTime() : '-'}</span>
        <span>{t('本地时间')}</span><span className={'toolbox-mono'}>{ts_to_date}</span>
        <span>ISO 8601</span><span className={'toolbox-mono'}>{d ? d.toISOString() : '-'}</span>
        <span>{t('UTC 时间')}</span><span className={'toolbox-mono'}>{d ? d.toUTCString() : '-'}</span>
        <span>{t('距现在')}</span><span className={'toolbox-mono'}>{d ? format_diff(d.getTime() - now.getTime(), t) : '-'}</span>
      </div>
      <div className={'div-row'} style={{alignItems: 'center', gap: '0.5em', marginTop: '0.5em', flexWrap: 'wrap'}}>
        <span className={'toolbox-label'}>{t('日期')}</span>
        <InputText width={'14em'} value={date_text} placeholder={'2024-01-01 12:00:00'}
                   handleInputChange={set_date_text}/>
        <ButtonText text={t('转时间戳')} clickFun={date_to_ts}/>
      </div>
    </Card>
  )
}

/** 把毫秒差换成人类可读的中文描述 */
function format_diff(ms: number, t: (k: string) => string): string {
  const abs = Math.abs(ms)
  const future = ms > 0
  const units: [number, string][] = [
    [86400000, t('天')],
    [3600000, t('小时')],
    [60000, t('分钟')],
    [1000, t('秒')]
  ]
  for (const [unit_ms, name] of units) {
    if (abs >= unit_ms) {
      const v = Math.floor(abs / unit_ms)
      return `${future ? t('还有') : t('已过去')} ${v} ${name}`
    }
  }
  return t('刚刚')
}

/* ---------------- 进制转换 ---------------- */

function RadixCard() {
  const {t} = useTranslation()
  const [value, set_value] = useState('255')
  const [from, set_from] = useState('10')

  const from_options = [
    {label: '2 ' + t('进制'), value: '2'}, {label: '8 ' + t('进制'), value: '8'},
    {label: '10 ' + t('进制'), value: '10'}, {label: '16 ' + t('进制'), value: '16'}, {label: '36 ' + t('进制'), value: '36'}
  ]

  let num = NaN
  try {
    const clean = value.trim().toLowerCase().replace(/^0x/, '')
    num = from === '10' ? Number(clean) : parseInt(clean, Number(from))
  } catch (e) {
    num = NaN
  }

  const rows: { label: string, v: string }[] = []
  if (Number.isFinite(num)) {
    rows.push({label: '2 ' + t('进制'), v: num.toString(2)})
    rows.push({label: '8 ' + t('进制'), v: num.toString(8)})
    rows.push({label: '10 ' + t('进制'), v: num.toString(10)})
    rows.push({label: '16 ' + t('进制'), v: num.toString(16).toUpperCase()})
    rows.push({label: '36 ' + t('进制'), v: num.toString(36).toUpperCase()})
    rows.push({label: t('字节'), v: byte_view(num, t)})
  }

  return (
    <Card title={t('进制转换')}>
      <div className={'div-row'} style={{alignItems: 'center', gap: '0.5em', flexWrap: 'wrap'}}>
        <InputText width={'14em'} value={value} placeholder={t('输入数值')}
                   handleInputChange={v => set_value(v)}/>
        <Select options={from_options} value={from} width={'8em'} onChange={set_from}/>
      </div>
      {Number.isFinite(num) ? (
        <div className={'toolbox-kv'}>
          {rows.map(r => (
            <React.Fragment key={r.label}>
              <span>{r.label}</span>
              <span className={'toolbox-mono'}>{r.v}</span>
            </React.Fragment>
          ))}
        </div>
      ) : (
        <div className={'error_tip'}>{t('num_invalid')}</div>
      )}
    </Card>
  )
}

/** 按二进制位数展示占用多少字节 */
function byte_view(num: number, t: (k: string) => string): string {
  if (num < 0 || !Number.isInteger(num)) return '-'
  const bits = Math.max(8, Math.ceil(num.toString(2).length / 8) * 8)
  return `${bits / 8} ${t('字节')} (${bits} ${t('位')})`
}

/* ---------------- 颜色转换 ---------------- */

function hex_to_rgb(hex: string): { r: number, g: number, b: number } | null {
  const clean = hex.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(clean)) {
    return {
      r: parseInt(clean[0] + clean[0], 16),
      g: parseInt(clean[1] + clean[1], 16),
      b: parseInt(clean[2] + clean[2], 16)
    }
  }
  if (/^[0-9a-fA-F]{6}$/.test(clean)) {
    return {
      r: parseInt(clean.substr(0, 2), 16),
      g: parseInt(clean.substr(2, 2), 16),
      b: parseInt(clean.substr(4, 2), 16)
    }
  }
  return null
}

function rgb_to_hsl(r: number, g: number, b: number): { h: number, s: number, l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return {h: 0, s: 0, l: Math.round(l * 100)}
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
  else if (max === gn) h = ((bn - rn) / d + 2) / 6
  else h = ((rn - gn) / d + 4) / 6
  return {h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100)}
}

function ColorCard() {
  const {t} = useTranslation()
  const [hex, set_hex] = useState('#4a90d9')
  const rgb = hex_to_rgb(hex)
  const hsl = rgb ? rgb_to_hsl(rgb.r, rgb.g, rgb.b) : null

  return (
    <Card title={t('颜色转换')}>
      <div className={'div-row'} style={{alignItems: 'center', gap: '0.5em', flexWrap: 'wrap'}}>
        <input type={'color'} className={'toolbox-color-picker'}
               value={rgb ? to_hex6(rgb.r, rgb.g, rgb.b) : '#000000'}
               onChange={e => set_hex(e.target.value)}/>
        <InputText width={'12em'} value={hex} placeholder={'#4a90d9'} handleInputChange={set_hex}/>
        <ActionButton icon={'content_copy'} title={t('复制颜色')} onClick={() => {
          if (!rgb) {
            NotyFail(t('颜色格式无效'))
            return
          }
          copyToClipboard(to_hex6(rgb.r, rgb.g, rgb.b))
        }}/>
      </div>
      {rgb && hsl ? (
        <div className={'toolbox-kv'}>
          <span>HEX</span><span className={'toolbox-mono'}>{to_hex6(rgb.r, rgb.g, rgb.b).toUpperCase()}</span>
          <span>RGB</span><span className={'toolbox-mono'}>rgb({rgb.r}, {rgb.g}, {rgb.b})</span>
          <span>RGBA</span><span className={'toolbox-mono'}>rgba({rgb.r}, {rgb.g}, {rgb.b}, 1)</span>
          <span>HSL</span><span className={'toolbox-mono'}>hsl({hsl.h}, {hsl.s}%, {hsl.l}%)</span>
        </div>
      ) : (
        <div className={'error_tip'}>{t('color_invalid')}</div>
      )}
    </Card>
  )
}

function to_hex6(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/* ---------------- UUID / 随机密码 ---------------- */

const uuid_chars = '0123456789abcdef'

/** 用 crypto.getRandomValues 生成 v4 UUID */
function gen_uuid(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  // 版本号 4
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  // variant 10xx
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  let hex = ''
  bytes.forEach(b => hex += uuid_chars[b >> 4] + uuid_chars[b & 15])
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

const pw_sets = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  symbol: '!@#$%^&*()-_=+[]{};:,.<>?'
}

function RandomCard() {
  const {t} = useTranslation()
  const [uuids, set_uuids] = useState<string[]>(() => [gen_uuid(), gen_uuid(), gen_uuid()])
  const [length, set_length] = useState('16')
  const [use_lower, set_lower] = useState(true)
  const [use_upper, set_upper] = useState(true)
  const [use_digit, set_digit] = useState(true)
  const [use_symbol, set_symbol] = useState(false)
  const [password, set_password] = useState('')

  const gen_password = () => {
    let pool = ''
    if (use_lower) pool += pw_sets.lower
    if (use_upper) pool += pw_sets.upper
    if (use_digit) pool += pw_sets.digit
    if (use_symbol) pool += pw_sets.symbol
    if (pool === '') {
      NotyFail(t('pw_need_set'))
      return
    }
    const len = Math.max(1, Math.min(256, Number(length) || 16))
    // 用 crypto 生成，避免 Math.random 的可预测性
    const bytes = new Uint32Array(len)
    crypto.getRandomValues(bytes)
    let out = ''
    for (let i = 0; i < len; i++) out += pool[bytes[i] % pool.length]
    set_password(out)
  }

  return (
    <Card title={t('UUID / 随机密码')}>
      <div className={'div-row'} style={{alignItems: 'center', gap: '0.5em', flexWrap: 'wrap'}}>
        <ButtonText text={t('生成 UUID')} clickFun={() => set_uuids([gen_uuid(), gen_uuid(), gen_uuid()])}/>
      </div>
      <div className={'toolbox-kv'}>
        {uuids.map((u, i) => (
          <React.Fragment key={i}>
            <span>UUID {i + 1}</span>
            <span className={'toolbox-mono toolbox-copyable'} onClick={() => copyToClipboard(u)} title={t('点击复制')}>
              {u}
            </span>
          </React.Fragment>
        ))}
      </div>

      <div className={'div-row'} style={{alignItems: 'center', gap: '0.5em', marginTop: '0.75em', flexWrap: 'wrap'}}>
        <span className={'toolbox-label'}>{t('长度')}</span>
        <InputText width={'5em'} value={length} handleInputChange={set_length}/>
        <label className={'toolbox-check'}>
          <input type={'checkbox'} checked={use_lower} onChange={e => set_lower(e.target.checked)}/><span>a-z</span>
        </label>
        <label className={'toolbox-check'}>
          <input type={'checkbox'} checked={use_upper} onChange={e => set_upper(e.target.checked)}/><span>A-Z</span>
        </label>
        <label className={'toolbox-check'}>
          <input type={'checkbox'} checked={use_digit} onChange={e => set_digit(e.target.checked)}/><span>0-9</span>
        </label>
        <label className={'toolbox-check'}>
          <input type={'checkbox'} checked={use_symbol} onChange={e => set_symbol(e.target.checked)}/><span>{t('符号')}</span>
        </label>
        <ButtonText text={t('生成密码')} clickFun={gen_password}/>
      </div>
      {password !== '' && (
        <div className={'toolbox-kv'}>
          <span>{t('密码')}</span>
          <span className={'toolbox-mono toolbox-copyable'} onClick={() => copyToClipboard(password)} title={t('点击复制')}>
            {password}
          </span>
        </div>
      )}
    </Card>
  )
}

/* ---------------- 页面 ---------------- */

export function DeveloperTool() {
  return (
    <Dashboard>
      <Row>
        <Column widthPer={50} maxWidth={'30rem'}>
          <TimeCard/>
        </Column>
        <Column widthPer={50} maxWidth={'30rem'}>
          <RadixCard/>
        </Column>
      </Row>
      <Row>
        <Column widthPer={50} maxWidth={'30rem'}>
          <ColorCard/>
        </Column>
        <Column widthPer={50} maxWidth={'30rem'}>
          <RandomCard/>
        </Column>
      </Row>
    </Dashboard>
  )
}
