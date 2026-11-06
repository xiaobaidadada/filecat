import React, {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {Column, Dashboard, Row} from '../../../meta/component/Dashboard'
import {Card} from '../../../meta/component/Card'
import {Select, InputTextarea} from '../../../meta/component/Input'
import {ActionButton, ButtonText} from '../../../meta/component/Button'
import {codec_list, codec_name, decode_text, encode_text} from './codec_util'
import {NotyFail} from '../../util/noty'
import {copyToClipboard} from '../../util/FunUtil'

/**
 * 编解码：Base64 / Base32 / Hex / Unicode / URL / ASCII / HTML 实体。
 * 输入输出双向可编辑，结果可一键回填到输入区继续处理。
 */
export function Codec() {
  const {t} = useTranslation()
  const [codec, set_codec] = useState<codec_name>('base64')
  const [input, set_input] = useState('')
  const [output, set_output] = useState('')
  const [error, set_error] = useState('')
  // hex 与 ascii 的细分选项
  const [upper_hex, set_upper_hex] = useState(false)
  const [space_sep, set_space_sep] = useState(false)

  const run = (fn: () => string) => {
    try {
      set_output(fn())
      set_error('')
    } catch (e) {
      set_error((e as Error).message)
    }
  }

  const output_to_input = () => {
    if (output === '') {
      NotyFail(t('输出为空'))
      return
    }
    set_input(output)
    set_output('')
  }

  // 只有 hex / ascii 有额外格式选项
  const show_upper = codec === 'hex'
  const show_space = codec === 'hex' || codec === 'ascii'

  const copy_btn = (text: string) => (
    <ActionButton icon={'content_copy'} title={t('复制')} onClick={() => {
      if (text === '') {
        NotyFail(t('内容为空'))
        return
      }
      copyToClipboard(text)
    }}/>
  )

  return (
    <Dashboard>
      <Row>
        <Column widthPer={25} maxWidth={'20rem'}>
          <Card title={t('编解码')}>
            <div className={'div-row'} style={{alignItems: 'center', gap: '0.5em', flexWrap: 'wrap'}}>
              <Select options={codec_list} value={codec} width={'10em'} onChange={set_codec}/>
              <ButtonText text={t('编码')} clickFun={() => run(() => encode_text(input, codec, upper_hex, space_sep))}/>
              <ButtonText text={t('解码')} clickFun={() => run(() => decode_text(input, codec))}/>
              <ButtonText text={t('结果转到输入')} clickFun={output_to_input}/>
              {show_upper && (
                <label className={'toolbox-check'}>
                  <input type={'checkbox'} checked={upper_hex} onChange={e => set_upper_hex(e.target.checked)}/>
                  <span>{t('大写')}</span>
                </label>
              )}
              {show_space && (
                <label className={'toolbox-check'}>
                  <input type={'checkbox'} checked={space_sep} onChange={e => set_space_sep(e.target.checked)}/>
                  <span>{t('空格分隔')}</span>
                </label>
              )}
            </div>
            {error !== '' && <div className={'error_tip'}>{error}</div>}
          </Card>
        </Column>
        <Column widthPer={37.5} maxWidth={'30rem'}>
          <Card title={t('输入')} rightTopCom={copy_btn(input)}>
            <InputTextarea
              value={input}
              style={{width: '100%', height: '270px'}}
              spellCheck={false}
              handleInputChange={v => {
                set_input(v)
                set_error('')
              }}
              placeholder={t('codec_in_ph')}
            />
          </Card>
        </Column>
        <Column widthPer={37.5} maxWidth={'30rem'}>
          <Card title={t('输出')} rightTopCom={copy_btn(output)}>
            <InputTextarea
              value={output}
              style={{width: '100%', height: '270px'}}
              spellCheck={false}
              handleInputChange={v => set_output(v)}
              placeholder={t('codec_out_ph')}
            />
          </Card>
        </Column>
      </Row>
    </Dashboard>
  )
}
