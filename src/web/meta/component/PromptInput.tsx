import React, {useState} from "react";
import {InputText, InputTextarea} from "./Input";

/**
 * 弹框（set_prompt_card）内用的输入框，确认按钮由弹框自己渲染。
 * 默认单行；传 multiline 后改用多行 textarea（内容可能较长时使用，如备注、描述）。
 */
export default function PromptInput(props: {
    /** 初始值，弹框重新打开时可预填 */
    initValue?: string;
    placeholder?: string;
    /** 多行模式：使用 textarea 代替单行 input */
    multiline?: boolean;
    /** 多行模式下的行数 */
    rows?: number;
    onChange: (value: string) => void;
}) {
    const [value, setValue] = useState(props.initValue || "");

    const handle_change = (v: string) => {
        setValue(v);
        props.onChange(v);
    };

    if (props.multiline) {
        return (
            <div className="prompt-input">
                <InputTextarea
                    placeholder={props.placeholder || ""}
                    rows={props.rows ?? 5}
                    value={value}
                    handleInputChange={handle_change}
                />
            </div>
        );
    }

    return (
        <div className="prompt-input">
            <InputText
                placeholder={props.placeholder || ""}
                value={value}
                handleInputChange={handle_change}
            />
        </div>
    );
}
