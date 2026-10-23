import React, {useMemo, useRef, useState} from "react";
import {use_click_outside} from "../../../meta/component/use_click_outside";
import {use_floating} from "../../../meta/component/use_floating";
import {
    CRON_FIELDS,
    cron_default_value,
    cron_field,
    cron_to_str,
    cron_value,
    describe_cron,
    parse_cron,
} from "../../util/cron";
import {CronField} from "./CronField";

/**
 * cron 表达式编辑与显示组件。
 *
 * 交互分两层：
 *   1. 常用预设：一键套用每分钟 / 每小时 / 每天 / 每周 / 每月等常见规则；
 *   2. 自定义：按「秒 分 时 日 月 星期」逐段选择模式与参数，不允许手打表达式。
 *
 * 组件对外的值就是 cron 字符串，与后端 node-cron 的 6 段格式一致。
 * 传入的字符串解析失败时（如老数据写了非法值），回退到默认值展示，
 * 但不会立即覆盖原值 —— 只有用户真正改动后才回调 onChange。
 */

interface CronInputProps {
    /** 当前 cron 表达式，格式：秒 分 时 日 月 星期 */
    value?: string;
    /** 表达式变化时回调（传入完整 6 段字符串） */
    onChange: (value: string) => void;
    /** 表格单元格内使用：去掉边框，且只显示表达式不显示描述（列宽通常很窄） */
    no_border?: boolean;
}

/** 常用预设：每项返回一个 cron 值 */
const CRON_PRESETS: { label: string; make: () => cron_value }[] = [
    {
        label: "每分钟",
        make: () => ({...cron_default_value(), second: {mode: "list", values: [0]}}),
    },
    {
        label: "每 5 分钟",
        make: () => ({...cron_default_value(), minute: {mode: "step", step: 5}, second: {mode: "list", values: [0]}}),
    },
    {
        label: "每小时",
        make: () => ({...cron_default_value(), minute: {mode: "list", values: [0]}, second: {mode: "list", values: [0]}}),
    },
    {
        label: "每天 0 点",
        make: () => ({
            ...cron_default_value(),
            hour: {mode: "list", values: [0]},
            minute: {mode: "list", values: [0]},
            second: {mode: "list", values: [0]},
        }),
    },
    {
        label: "每天 8 点",
        make: () => ({
            ...cron_default_value(),
            hour: {mode: "list", values: [8]},
            minute: {mode: "list", values: [0]},
            second: {mode: "list", values: [0]},
        }),
    },
    {
        label: "每周一 0 点",
        make: () => ({
            ...cron_default_value(),
            hour: {mode: "list", values: [0]},
            minute: {mode: "list", values: [0]},
            second: {mode: "list", values: [0]},
            week: {mode: "list", values: [1]},
        }),
    },
    {
        label: "每月 1 号 0 点",
        make: () => ({
            ...cron_default_value(),
            hour: {mode: "list", values: [0]},
            minute: {mode: "list", values: [0]},
            second: {mode: "list", values: [0]},
            day: {mode: "list", values: [1]},
        }),
    },
];


export const CronInput: React.FC<CronInputProps> = ({value, onChange, no_border}) => {
    const [open, set_open] = useState(false);
    const trigger_ref = useRef<HTMLDivElement>(null);
    const editor_ref = useRef<HTMLDivElement>(null);

    // 表达式解析：失败时用默认值展示，但不写回
    const parsed = useMemo(() => parse_cron(value ?? "") ?? cron_default_value(), [value]);
    const invalid = !!value && !parse_cron(value ?? "");

    // 浮层定位：始终留在视口内，下方放不下自动翻到上方
    const pos = use_floating({
        active: open,
        trigger_ref,
        floating_ref: editor_ref,
        width: 384,
        // 高度上限用 rem，与页面字号联动
        max_height: 26,
    });

    // 点击外部关闭：触发器、编辑面板、以及任意 portal 浮层（如 Select 下拉）都不算外部
    use_click_outside(open, [trigger_ref, editor_ref], () => set_open(false));

    /** 改动后同时回调字符串值 */
    const apply = (next: cron_value) => {
        onChange(cron_to_str(next));
    };

    const set_field = (key: keyof cron_value, field: cron_field) => {
        apply({...parsed, [key]: field});
    };

    return (
        <div className={`cron-input ${open ? "cron-input--open" : ""}`}>
            {/* 触发器：显示表达式 + 人话描述，点击展开编辑器 */}
            <div
                ref={trigger_ref}
                className={`cron-input__display ${no_border ? "cron-input__display--no-border" : ""}`}
                title={invalid ? "表达式格式不正确" : `${value || ""} ${describe_cron(parsed)}`.trim()}
                onClick={() => set_open(!open)}
            >
                <span className={`cron-input__expr ${invalid ? "cron-input__expr--invalid" : ""}`}>
                    {value || "（未设置）"}
                </span>
                {/* 表格里列宽很窄（约 125px），描述放不下会挤掉表达式，
                    所以只在无边框的独立场景显示描述，表格内改用 title 悬浮提示 */}
                {!no_border && (
                    <span className="cron-input__desc">
                        {invalid ? "表达式格式不正确" : describe_cron(parsed)}
                    </span>
                )}
                <i className="material-icons cron-input__arrow">arrow_drop_down</i>
            </div>

            {open && (
                <div
                    ref={editor_ref}
                    className="cron-editor"
                    style={{
                        left: pos.left,
                        top: pos.top,
                        // 高度由 CSS 的 max-height 决定（rem），这里只透传变量：
                        // --floating-max-height 是配置的高度上限，--floating-available 是视口兜底
                        ...pos.css_vars,
                        // 尺寸量好之前先隐藏，避免先出现在错误位置再跳过去
                        visibility: pos.ready ? "visible" : "hidden",
                    }}
                >
                    <div className="cron-editor__scroll">
                        {/* 常用预设 */}
                        <div className="cron-editor__row">
                            <span className="cron-editor__title">常用</span>
                            <div className="cron-editor__presets">
                                {/* 预设只应用、不关闭：点预设常常只是想看看效果，
                                    关闭统一交给「完成」按钮 */}
                                {CRON_PRESETS.map(p => (
                                    <button
                                        key={p.label}
                                        className="cron-preset"
                                        onClick={() => apply(p.make())}
                                    >{p.label}</button>
                                ))}
                            </div>
                        </div>

                        {/* 逐段自定义 */}
                        <div className="cron-editor__fields">
                            {CRON_FIELDS.map(def => (
                                <CronField
                                    key={def.key}
                                    label={def.label}
                                    field={parsed[def.key]}
                                    min={def.min}
                                    max={def.max}
                                    pad={def.key !== "day" && def.key !== "month" && def.key !== "week"}
                                    week_label={def.key === "week"}
                                    onChange={(f) => set_field(def.key, f)}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="cron-editor__footer">
                        <span className="cron-editor__preview">{cron_to_str(parsed)}</span>
                        <button className="cron-editor__done" onClick={() => set_open(false)}>完成</button>
                    </div>
                </div>
            )}
        </div>
    );
};

/** 只读展示用：把表达式渲染成「表达式 + 人话」两行 */
export const CronDisplay: React.FC<{ value?: string }> = ({value}) => {
    const parsed = useMemo(() => parse_cron(value ?? ""), [value]);
    return (
        <div className="cron-display">
            <code>{value || "-"}</code>
            <span className="cron-display__desc">
                {parsed ? describe_cron(parsed) : (value ? "格式不正确" : "")}
            </span>
        </div>
    );
};
