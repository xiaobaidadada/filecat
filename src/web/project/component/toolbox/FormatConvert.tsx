import React, {useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {Column, Dashboard, Row} from '../../../meta/component/Dashboard'
import {Card} from '../../../meta/component/Card'
import {Select} from '../../../meta/component/Input'
import {ButtonText} from '../../../meta/component/Button'
import AceCodeEditor, {AceCodeEditorHandle} from '../../../meta/component/AceCodeEditor'
import {convert_text, format_mode, format_name} from './format_convert'
import {NotyFail} from '../../util/noty'

const format_options: { label: string, value: format_name }[] = [
  {label: 'JSON', value: 'json'},
  {label: 'YAML', value: 'yaml'},
  {label: 'TOML', value: 'toml'},
  {label: 'XML', value: 'xml'}
]

const sample_text: Record<format_name, string> = {
  json: `{
  "name": "filecat",
  "version": 2,
  "debug": true,
  "tags": ["file", "server"],
  "server": {
    "host": "0.0.0.0",
    "port": 5567
  }
}`,
  yaml: `name: filecat
version: 2
debug: true
tags:
  - file
  - server
server:
  host: 0.0.0.0
  port: 5567`,
  toml: `name = "filecat"
version = 2
debug = true
tags = [ "file", "server" ]

[server]
host = "0.0.0.0"
port = 5567`,
  xml: `<root>
  <name>filecat</name>
  <version>2</version>
  <debug>true</debug>
  <tags>file</tags>
  <tags>server</tags>
  <server>
    <host>0.0.0.0</host>
    <port>5567</port>
  </server>
</root>`
}

/** AceCodeEditor 的 value 只在首次渲染生效，靠 key 变化强制重挂载来灌入新内容 */
let editor_key_seed = 0

/**
 * JSON / YAML / TOML / XML 互转。
 * 四种格式都是树状结构，统一解析成普通对象后再序列化到目标格式。
 */
export function FormatConvert() {
  const {t} = useTranslation()
  const [from, setFrom] = useState<format_name>('json')
  const [to, setTo] = useState<format_name>('yaml')
  const [error, set_error] = useState('')
  // 切换格式时把输入区内容带到新编辑器（AceCodeEditor 不跟随 value 变化）
  const [from_key, set_from_key] = useState(++editor_key_seed)
  const [to_key, set_to_key] = useState(++editor_key_seed)
  const from_text_ref = useRef(sample_text.json)
  const to_text_ref = useRef('')
  const from_ref = useRef<AceCodeEditorHandle>(null)
  const to_ref = useRef<AceCodeEditorHandle>(null)

  const remount_from = (text: string) => {
    from_text_ref.current = text
    set_from_key(++editor_key_seed)
  }

  /** 切换源格式：内容保留，语法高亮跟着换 */
  const change_from = (v: format_name) => {
    const now = from_ref.current?.getValue()
    setFrom(v)
    remount_from(now !== undefined ? now : from_text_ref.current)
  }

  const do_convert = (target: format_name) => {
    const text = from_ref.current?.getValue() ?? ''
    if (text.trim() === '') {
      NotyFail(t('need_input'))
      return
    }
    try {
      const result = convert_text(text, from, target)
      to_text_ref.current = result
      set_to_key(++editor_key_seed)
      set_error('')
    } catch (e) {
      set_error((e as Error).message)
    }
  }

  /** 把输出结果放到输入区，方便接着转成第三种格式 */
  const output_to_input = () => {
    const text = to_ref.current?.getValue()
    if (!text) {
      NotyFail(t('输出为空'))
      return
    }
    setFrom(to)
    remount_from(text)
  }

  return (
    <Dashboard>
      <Row>
        <Column widthPer={100} maxWidth={'60rem'}>
          <Card title={t('JSON 格式转换')}>
            <div className={'div-row'} style={{alignItems: 'center', gap: '0.5em', flexWrap: 'wrap'}}>
              <Select options={format_options} value={from} width={'9em'} onChange={change_from}/>
              <span>{t('转换成')}</span>
              <Select options={format_options} value={to} width={'9em'} onChange={setTo}/>
              <ButtonText text={t('转换')} clickFun={() => do_convert(to)}/>
              <ButtonText text={t('格式化')} clickFun={() => do_convert(from)}/>
              <ButtonText text={t('结果转到输入')} clickFun={output_to_input}/>
              <ButtonText text={t('示例')} clickFun={() => remount_from(sample_text[from])}/>
            </div>
            {error !== '' && <div className={'error_tip'}>{error}</div>}
          </Card>
        </Column>
      </Row>
      <Row>
        <Column widthPer={50} maxWidth={'30rem'}>
          <Card title={t('输入') + '（' + from.toUpperCase() + '）'}>
            <AceCodeEditor
              key={from_key}
              ref={from_ref}
              className={'toolbox-ace'}
              value={from_text_ref.current}
              mode={format_mode[from]}
              wrap={true}
              onChange={() => set_error('')}
            />
          </Card>
        </Column>
        <Column widthPer={50} maxWidth={'30rem'}>
          <Card title={t('输出') + '（' + to.toUpperCase() + '）'}>
            <AceCodeEditor
              key={to_key}
              ref={to_ref}
              className={'toolbox-ace'}
              value={to_text_ref.current}
              mode={format_mode[to]}
              wrap={true}
            />
          </Card>
        </Column>
      </Row>
    </Dashboard>
  )
}
