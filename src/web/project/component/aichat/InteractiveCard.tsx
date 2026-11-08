/**
 * 消息流里的交互卡片
 *
 * 两种形态：
 *  - confirm_cmd：命令确认，展示命令 + 允许/拒绝
 *  - ask_user：AI 提问，渲染字段表单（select / checkbox / text）
 *
 * 关键设计：这里不通过任何 WS 通道回传答案，
 * 而是把用户的回答拼成一条**普通用户消息**发出去，开启新一轮对话。
 * 所以刷新、重启都不影响，状态完全靠持久化的消息。
 */
import React, {useEffect, useState} from 'react';
import {useTranslation} from 'react-i18next';
import {ButtonText} from "../../../meta/component/Button";
import {InputText, InputTextarea} from "../../../meta/component/Input";
import type {Message} from "./page/chatTypes";

type Interactive = NonNullable<Message['interactive']>;

/** 单选 */
function SelectField(props: {
    options: string[];
    value: string;
    onChange: (v: string) => void;
}) {
    return (<div className={"ai-ask-options"}>
        {props.options.map(opt => (<label key={opt}
                                          className={"ai-ask-option" + (props.value === opt ? " ai-ask-option--on" : "")}>
            <input type="radio" name={props.options.join("|")} checked={props.value === opt}
                   onChange={() => props.onChange(opt)}/>
            <span>{opt}</span>
        </label>))}
    </div>);
}

/** 多选 */
function CheckboxField(props: {
    options: string[];
    value: string[];
    onChange: (v: string[]) => void;
}) {
    const toggle = (opt: string) => {
        const has = props.value.includes(opt);
        props.onChange(has ? props.value.filter(v => v !== opt) : [...props.value, opt]);
    };
    return (<div className={"ai-ask-options"}>
        {props.options.map(opt => (<label key={opt}
                                          className={"ai-ask-option" + (props.value.includes(opt) ? " ai-ask-option--on" : "")}>
            <input type="checkbox" checked={props.value.includes(opt)} onChange={() => toggle(opt)}/>
            <span>{opt}</span>
        </label>))}
    </div>);
}

export default function InteractiveCard(props: {
    interactive: Interactive;
    /** 卡片处理完成时回调，把气泡转成只读 */
    on_resolved: (ask_id: string) => void;
    /** 把用户的回答作为一条消息发出去，开启新一轮 */
    on_submit: (text: string, meta?: {ask_id: string; answer: string}) => void;
}) {
    const {t} = useTranslation();
    const it = props.interactive;
    const [answers, set_answers] = useState<Record<string, any>>({});

    useEffect(() => {
        const init: Record<string, any> = {};
        for (const f of it.fields ?? []) {
            init[f.key] = f.type === 'checkbox' ? [] : '';
        }
        set_answers(init);
    }, [it.ask_id]);

    const finish = (answer: string) => {
        // 提交后立刻从消息列表移除（由 on_resolved 处理），
        // 不留「已处理」这类残留卡片
        props.on_resolved(it.ask_id);
        props.on_submit('', {ask_id: it.ask_id, answer});
    };

    // ===== 命令确认 =====
    if (it.kind === 'confirm_cmd') {
        return (<div className={"ai-interactive"}>
            <p className={"ai-interactive-title"}>{t("是否允许执行该命令")}</p>
            <pre className={"ai-interactive-cmd"}>{it.cmd}</pre>
            <div className={"div-row"}>
                <ButtonText text={t("允许")} clickFun={() => finish('allow')}/>
                <ButtonText text={t("拒绝")} clickFun={() => finish('reject')}/>
            </div>
        </div>);
    }

    // ===== ask_user =====
    const submit = () => {
        const missing = (it.fields ?? []).filter(f => {
            if (!f.required) return false;
            const v = answers[f.key];
            return v === '' || v === undefined || (Array.isArray(v) && v.length === 0);
        });
        if (missing.length) {
            return;
        }
        // 把回答整理成人类可读的文本发给模型
        const lines = (it.fields ?? []).map(f => {
            const v = answers[f.key];
            const text = Array.isArray(v) ? v.join("、") : String(v ?? "");
            return `${f.label}：${text}`;
        });
        finish(JSON.stringify(answers));
    };

    return (<div className={"ai-interactive"}>
        <p className={"ai-interactive-title"}>{it.title}</p>
        {it.description && <p className={"ai-interactive-desc"}>{it.description}</p>}
        {(it.fields ?? []).map(f => (<div key={f.key} className={"ai-ask-field"}>
            <p className={"ai-ask-label"}>{f.label}{f.required ? " *" : ""}</p>
            {f.type === 'select' && <SelectField options={f.options ?? []}
                                                 value={answers[f.key] ?? ''}
                                                 onChange={(v) => set_answers(prev => ({...prev, [f.key]: v}))}/>}
            {f.type === 'checkbox' && <CheckboxField options={f.options ?? []}
                                                     value={answers[f.key] ?? []}
                                                     onChange={(v) => set_answers(prev => ({...prev, [f.key]: v}))}/>}
            {f.type === 'text' && (f.multiline
                ? <InputTextarea value={answers[f.key] ?? ''}
                                 placeholder={f.placeholder ?? ''}
                                 handleInputChange={(v) => set_answers(prev => ({...prev, [f.key]: v}))}/>
                : <InputText value={answers[f.key] ?? ''}
                             placeholder={f.placeholder ?? ''}
                             handleInputChange={(v) => set_answers(prev => ({...prev, [f.key]: v}))}/>)}
        </div>))}
        <div className={"div-row"}>
            <ButtonText text={t("提交")} clickFun={submit}/>
            <ButtonText text={t("取消")} clickFun={() => finish('cancel')}/>
        </div>
    </div>);
}
