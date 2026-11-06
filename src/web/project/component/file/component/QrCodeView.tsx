import React, {useEffect, useRef, useState} from 'react'
import QRCode from 'qrcode'

/**
 * 弹窗内展示二维码。传入内容即渲染到 canvas。
 *
 * 抽成独立组件而不是复用工具箱页面的 QrCode，
 * 是因为工具页带着输入框、尺寸、纠错级别等整套表单，
 * 这里只需要「把给定内容画成二维码」。
 */
export default function QrCodeView({text}: { text: string }) {
  const canvas_ref = useRef<HTMLCanvasElement>(null)
  const [error, set_error] = useState('')

  useEffect(() => {
    const canvas = canvas_ref.current
    if (!canvas) return
    QRCode.toCanvas(canvas, text, {width: 260, margin: 2, errorCorrectionLevel: 'M'})
      .then(() => set_error(''))
      .catch((e: Error) => set_error(e.message))
  }, [text])

  if (error !== '') {
    return <div className={'qrcode-view-error'}>{error}</div>
  }
  return <canvas ref={canvas_ref} className={'qrcode-view-canvas'}/>
}
