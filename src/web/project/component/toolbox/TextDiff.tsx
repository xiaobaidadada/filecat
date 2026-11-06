import React, {useState} from 'react'
import {useTranslation} from 'react-i18next'
import {Column, Dashboard, Row} from '../../../meta/component/Dashboard'
import {Card} from '../../../meta/component/Card'
import {InputTextarea} from '../../../meta/component/Input'
import AceDiffView from '../../../meta/component/AceDiffView'

/**
 * 文本对比。左右两个输入框填写文本，下方用 Ace 官方 diff 视图并排展示差异。
 *
 * 用的是项目里已有的 AceDiffView（Studio 的 diff 面板同款），
 * 自带行级/字符级高亮、同步滚动、折叠未改动区域，无需额外依赖。
 */
export function TextDiff() {
  const {t} = useTranslation()
  const [left, set_left] = useState('')
  const [right, set_right] = useState('')

  // 两边都空时不渲染 diff 视图，避免一个空白的 0 行编辑器
  const has_content = left !== '' || right !== ''

  return (
    <Dashboard>
      <Row>
        <Column widthPer={50} maxWidth={'50rem'}>
          <Card title={t('原文本')}>
            <InputTextarea
              value={left}
              style={{width: '100%', height: '200px'}}
              spellCheck={false}
              handleInputChange={v => set_left(v)}
              placeholder={t('粘贴原文本')}
            />
          </Card>
        </Column>
        <Column widthPer={50} maxWidth={'50rem'}>
          <Card title={t('新文本')}>
            <InputTextarea
              value={right}
              style={{width: '100%', height: '200px'}}
              spellCheck={false}
              handleInputChange={v => set_right(v)}
              placeholder={t('粘贴新文本')}
            />
          </Card>
        </Column>
      </Row>
      <Row>
        <Column widthPer={100} maxWidth={'100rem'}>
          <Card title={t('差异')}>
            <div className={'text-diff-box'}>
              {has_content
                ? <AceDiffView valueA={left} valueB={right} mode={'split'}/>
                : <div className={'text-diff-empty'}>{t('输入文本后这里显示差异')}</div>}
            </div>
          </Card>
        </Column>
      </Row>
    </Dashboard>
  )
}
