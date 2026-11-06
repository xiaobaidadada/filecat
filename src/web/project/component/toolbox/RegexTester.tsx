import React, {useMemo, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {Column, Dashboard, Row} from '../../../meta/component/Dashboard'
import {Card} from '../../../meta/component/Card'
import {InputText, InputTextarea} from '../../../meta/component/Input'

/** 单个匹配结果 */
interface match_item {
  text: string
  index: number
  groups: string[]
}

interface test_result {
  matches: match_item[]
  error: string
}

const flag_list: { label: string, value: string, desc: string, raw?: boolean }[] = [
  {label: 'd', value: 'd', desc: '分组索引'},
  {label: 'g', value: 'g', desc: '全局'},
  {label: 'i', value: 'i', desc: '忽略大小写'},
  {label: 'm', value: 'm', desc: '多行'},
  {label: 's', value: 's', desc: '含换行'},
  {label: 'u', value: 'u', desc: 'Unicode', raw: true},
  {label: 'v', value: 'v', desc: 'Unicode 集合'},
  {label: 'y', value: 'y', desc: '粘性'}
]

/**
 * 执行正则并收集匹配。不带 g/y 时 exec 不会前进，只取首个避免死循环。
 */
function run_regex(pattern: string, flags: string, text: string): test_result {
  if (pattern === '') return {matches: [], error: ''}
  let reg: RegExp
  try {
    reg = new RegExp(pattern, flags)
  } catch (e) {
    return {matches: [], error: (e as Error).message}
  }
  const matches: match_item[] = []
  const global = flags.includes('g') || flags.includes('y')
  let m: RegExpExecArray | null
  let guard = 0
  while ((m = reg.exec(text)) !== null) {
    matches.push({text: m[0], index: m.index, groups: m.slice(1)})
    // 空匹配时手动前进，否则会无限循环
    if (!global) break
    if (m[0] === '') reg.lastIndex++
    if (++guard > 10000) break
  }
  return {matches, error: ''}
}

/** 把文本按匹配位置切段，命中部分加高亮 */
function render_highlight(text: string, matches: match_item[]) {
  if (matches.length === 0) return text
  const nodes: React.ReactNode[] = []
  let cursor = 0
  matches.forEach((m, i) => {
    if (m.index > cursor) nodes.push(text.slice(cursor, m.index))
    if (m.text !== '') {
      nodes.push(<mark key={i} className={'regex-mark'}>{m.text}</mark>)
    }
    cursor = m.index + m.text.length
  })
  if (cursor < text.length) nodes.push(text.slice(cursor))
  return nodes
}

/**
 * 正则表达式测试。实时高亮匹配，并列出每处匹配的分组。
 */
export function RegexTester() {
  const {t} = useTranslation()
  const [pattern, set_pattern] = useState('')
  const [text, set_text] = useState('')
  const [flags, set_flags] = useState('g')

  const result = useMemo(() => run_regex(pattern, flags, text), [pattern, flags, text])

  const toggle_flag = (f: string) => {
    set_flags(prev => prev.includes(f) ? prev.replace(f, '') : prev + f)
  }

  return (
    <Dashboard>
      <Row>
        <Column widthPer={100} maxWidth={'60rem'}>
          <Card title={t('正则表达式')}>
            {/* 正则输入单独一行，形如 /pattern/flags */}
            <div className={'regex-input-row'}>
              <span className={'regex-slash'}>/</span>
              <InputText
                width={'100%'}
                value={pattern}
                placeholder={t('正则表达式')}
                handleInputChange={v => set_pattern(v)}
              />
              <span className={'regex-slash'}>/</span>
              <span className={'regex-flags'}>{flags}</span>
            </div>
            {/* flags 单独一行，每个都带中文说明 */}
            <div className={'regex-flag-row'}>
              {flag_list.map(it => (
                <label key={it.value} title={it.raw ? it.desc : t(it.desc)} className={'toolbox-check'}>
                  <input type={'checkbox'} checked={flags.includes(it.value)}
                         onChange={() => toggle_flag(it.value)}/>
                  <span className={'regex-flag-letter'}>{it.label}</span>
                  <span>{it.raw ? it.desc : t(it.desc)}</span>
                </label>
              ))}
            </div>
            {result.error !== '' && <div className={'error_tip'}>{result.error}</div>}
            <div style={{marginTop: '0.5em'}}>
              {t('匹配到')} <b>{result.matches.length}</b> {t('处')}
            </div>
          </Card>
        </Column>
      </Row>
      <Row>
        <Column widthPer={50} maxWidth={'30rem'}>
          <Card title={t('测试文本')}>
            <InputTextarea
              value={text}
              style={{width: '100%', height: '260px'}}
              spellCheck={false}
              handleInputChange={v => set_text(v)}
              placeholder={t('regex_in_ph')}
            />
          </Card>
        </Column>
        <Column widthPer={50} maxWidth={'30rem'}>
          <Card title={t('高亮结果')}>
            <div className={'regex-preview'}>
              {text === '' ? <span className={'regex-empty'}>{t('regex_empty')}</span>
                : render_highlight(text, result.matches)}
            </div>
          </Card>
        </Column>
      </Row>
      {result.matches.length > 0 && (
        <Row>
          <Column widthPer={100} maxWidth={'60rem'}>
            <Card title={t('匹配详情')}>
              <div className={'regex-match-list'}>
                {result.matches.map((m, i) => (
                  <div key={i} className={'regex-match-item'}>
                    <span className={'regex-match-index'}>#{i + 1}</span>
                    <span className={'regex-match-text'}>{m.text === '' ? t('空') : m.text}</span>
                    <span className={'regex-match-pos'}>{t('位置')} {m.index}</span>
                    {m.groups.length > 0 && (
                      <span className={'regex-match-groups'}>
                        {m.groups.map((g, gi) => (
                          <span key={gi} className={'regex-group'}>${gi + 1}={g ?? t('未匹配')}</span>
                        ))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </Column>
        </Row>
      )}
    </Dashboard>
  )
}
