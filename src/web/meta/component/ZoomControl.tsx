import React, {useEffect, useState} from 'react';
import {useTranslation} from "react-i18next";
import {InputText} from "./Input";
import {ButtonText} from "./Button";

/**
 * 缩放百分比控件：- / 输入框 / +，可带范围提示。
 * 只负责交互与展示，具体数值的持久化由调用方通过 onChange 处理。
 *
 * 两种用法：
 * 1. 受控：传 value + onChange，值由外部持有；
 * 2. 非受控：只传 defaultValue + onChange，控件自己管显示值，
 *    适合放在 value 不会随之更新的容器里（如 prompt_card 的 context_div）。
 */
export function ZoomControl(props: {
    value?: number,
    defaultValue?: number,
    onChange: (value: number) => void,
    /** 允许的最小百分比，默认 30 */
    min?: number,
    /** 允许的最大百分比，默认 200 */
    max?: number,
    /** 每次点击增减的步长，默认 10 */
    step?: number,
}) {
    const { t } = useTranslation();
    const {onChange, min = 30, max = 200, step = 10} = props;
    const [inner, setInner] = useState(props.value ?? props.defaultValue ?? 100);
    // 受控模式下跟随外部值变化
    const value = props.value ?? inner;
    const setValue = (v: number) => {
        if (props.value === undefined) {
            setInner(v);
        }
        onChange(v);
    };
    const [inputValue, setInputValue] = useState(value.toString());

    // 外部值变化时同步输入框（如点击增减按钮后）
    useEffect(() => {
        setInputValue(value.toString());
    }, [value]);

    return (
        <div>
            <div style={{display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.5rem 0'}}>
                <ButtonText text={"-"} clickFun={() => setValue(Math.max(min, value - step))}/>
                <InputText
                    value={inputValue}
                    handleInputChange={(v: string) => {
                        setInputValue(v);
                        const num = parseInt(v, 10);
                        if (!isNaN(num) && num >= min && num <= max) {
                            setValue(num);
                        }
                    }}
                    placeholder={t("缩放百分比")}
                    width="6rem"
                />
                <span style={{fontSize: '0.9rem', color: 'var(--textSecondary)'}}>%</span>
                <ButtonText text={"+"} clickFun={() => setValue(Math.min(max, value + step))}/>
            </div>
            <div style={{fontSize: '0.8rem', color: 'var(--textTertiary)', marginTop: '0.5rem'}}>
                {t("范围")}: {min}% - {max}%
            </div>
        </div>
    );
}
