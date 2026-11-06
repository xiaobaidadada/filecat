import React, {useEffect, useRef, useState} from 'react'
import {useTranslation} from 'react-i18next'
import QRCode from 'qrcode'
import {Column, Dashboard, Row} from '../../../meta/component/Dashboard'
import {Card} from '../../../meta/component/Card'
import {InputText, InputTextarea} from '../../../meta/component/Input'
import {ActionButton, ButtonText} from '../../../meta/component/Button'
import {NotyFail} from '../../util/noty'

/** 纠错级别，容错越高可存内容越少 */
const level_list = [
  {label: 'L (7%)', value: 'L'},
  {label: 'M (15%)', value: 'M'},
  {label: 'Q (25%)', value: 'Q'},
  {label: 'H (30%)', value: 'H'}
]

/**
 * 二维码生成。内容或参数变化即重新渲染到 canvas，支持下载 PNG。
 */
export function QrCode() {
  const {t} = useTranslation()
  const canvas_ref = useRef<HTMLCanvasElement>(null)
  const [text, set_text] = useState('')
  const [size, set_size] = useState('320')
  const [level, set_level] = useState('M')
  const [error, set_error] = useState('')

  useEffect(() => {
    const canvas = canvas_ref.current
    if (!canvas) return
    if (text === '') {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
      set_error('')
      return
    }
    const px = Math.max(80, Math.min(2048, Number(size) || 320))
    QRCode.toCanvas(canvas, text, {
      width: px,
      margin: 2,
      errorCorrectionLevel: level as 'L' | 'M' | 'Q' | 'H'
    }).then(() => set_error('')).catch((e: Error) => {
      set_error(e.message)
    })
  }, [text, size, level])

  const download = () => {
    const canvas = canvas_ref.current
    if (!canvas || text === '') {
      NotyFail(t('qr_none'))
      return
    }
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = 'qrcode.png'
    a.click()
  }

  return (
    <Dashboard>
      <Row>
        <Column widthPer={50} maxWidth={'30rem'}>
          <Card title={t('二维码生成')}>
            <InputTextarea
              value={text}
              style={{width: '100%', height: '200px'}}
              spellCheck={false}
              handleInputChange={v => set_text(v)}
              placeholder={t('qr_in_ph')}
            />
            <div className={'div-row'} style={{alignItems: 'center', gap: '0.5em', marginTop: '0.5em', flexWrap: 'wrap'}}>
              <span className={'toolbox-label'}>{t('尺寸')}</span>
              <InputText width={'6em'} value={size} handleInputChange={v => set_size(v)}/>
              <span className={'toolbox-label'}>{t('纠错级别')}</span>
              <select className={'toolbox-select'} value={level} onChange={e => set_level(e.target.value)}>
                {level_list.map(it => <option key={it.value} value={it.value}>{it.label}</option>)}
              </select>
              <ButtonText text={t('下载 PNG')} clickFun={download}/>
            </div>
            {error !== '' && <div className={'error_tip'}>{error}</div>}
          </Card>
        </Column>
        <Column widthPer={50} maxWidth={'30rem'}>
          <Card title={t('预览')} rightTopCom={
            <ActionButton icon={'download'} title={t('下载')} onClick={download}/>
          }>
            <div className={'toolbox-qr-preview'}>
              {/* canvas 必须常驻，条件渲染会导致 effect 执行时 ref 为 null */}
              <canvas ref={canvas_ref} style={{display: text === '' ? 'none' : 'block'}}/>
              {text === '' && <span className={'toolbox-empty'}>{t('qr_empty')}</span>}
            </div>
          </Card>
        </Column>
      </Row>
    </Dashboard>
  )
}
