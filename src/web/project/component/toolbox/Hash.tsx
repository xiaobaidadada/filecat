import React, {useEffect, useState} from 'react'
import {useTranslation} from 'react-i18next'
import {Card} from '../../../meta/component/Card'
import {Column, Dashboard, Row} from '../../../meta/component/Dashboard'
import {ActionButton} from '../../../meta/component/Button'
import {InputTextarea} from '../../../meta/component/Input'
import {hash_all, hash_list, hash_name} from './hash_util'
import {NotyFail} from '../../util/noty'
import {copyToClipboard} from '../../util/FunUtil'

/**
 * 摘要算法。输入一次，实时算出全部结果，每行可单独复制。
 */
export function Hash() {
  const {t} = useTranslation()
  const [input, set_input] = useState('')
  const [result, set_result] = useState<Record<hash_name, string>>({} as Record<hash_name, string>)

  // 输入变化即重算：crypto.subtle 是异步的，用标记避免快速输入时的过期结果覆盖
  useEffect(() => {
    let alive = true
    if (input === '') {
      set_result({} as Record<hash_name, string>)
      return
    }
    hash_all(input).then(r => {
      if (alive) set_result(r)
    })
    return () => {
      alive = false
    }
  }, [input])

  return (
    <Dashboard>
      <Row>
        <Column widthPer={100} maxWidth={'60rem'}>
          <Card title={t('摘要算法')}>
            <InputTextarea
              value={input}
              style={{width: '100%', height: '120px'}}
              spellCheck={false}
              handleInputChange={v => set_input(v)}
              placeholder={t('hash_in_ph')}
            />
            <div style={{marginTop: '0.5em'}}>
              {hash_list.map(it => (
                <div key={it.value} className={'hash-row'}>
                  <span className={'hash-name'}>{it.label}</span>
                  <span className={'hash-value'}>{result[it.value] ?? ''}</span>
                  <ActionButton icon={'content_copy'} title={t('复制')} onClick={() => {
                    const v = result[it.value]
                    if (!v) {
                      NotyFail(t('内容为空'))
                      return
                    }
                    copyToClipboard(v)
                  }}/>
                </div>
              ))}
            </div>
          </Card>
        </Column>
      </Row>
    </Dashboard>
  )
}
