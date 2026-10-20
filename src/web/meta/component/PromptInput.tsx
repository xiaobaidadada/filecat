import React, {useState} from "react";
import {InputText} from "./Input";

/** 弹框（set_prompt_card）内用的一行输入，确认按钮由弹框自己渲染 */
export default function PromptInput(props: {
    /** 初始值，弹框重新打开时可预填 */
    initValue?: string;
    placeholder?: string;
    onChange: (value: string) => void;
}) {
    const [value, setValue] = useState(props.initValue || "");
    return (
        <div className="prompt-input">
            <InputText
                placeholder={props.placeholder || ""}
                value={value}
                handleInputChange={(v) => {
                    setValue(v);
                    props.onChange(v);
                }}
            />
        </div>
    );
}
