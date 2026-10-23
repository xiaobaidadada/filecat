import React, {useMemo} from "react";
import {Select} from "../../../meta/component/Input";
import {cron_field} from "../../util/cron";

/**
 * cron 单段编辑器：一个「标签 + 模式下拉 + 参数」的可复用小单元。
 *
 * 秒 / 分 / 时 / 日 / 月 / 星期每一段都是同样的结构，所以抽成组件，
 * 上层只需要把每段的 field 和 onChange 传进来。
 * 所有参数都通过下拉选择，不允许手输。
 */

/** 每段的模式下拉选项 */
const MODE_OPTIONS = [
    {label: "任意 (*)", value: "every"},
    {label: "每隔 (*/n)", value: "step"},
    {label: "区间 (a-b)", value: "range"},
    {label: "指定 (a,b)", value: "list"},
];

/** 把范围 [min,max] 转成 Select 选项，用于选择具体值 */
function number_options(min: number, max: number, pad: boolean = false) {
    const list: { label: string, value: number }[] = [];
    for (let i = min; i <= max; i++) {
        list.push({label: pad ? String(i).padStart(2, "0") : String(i), value: i});
    }
    return list;
}

interface CronFieldProps {
    /** 字段名，如「秒」「时」 */
    label: string;
    /** 当前段的结构化值 */
    field: cron_field;
    /** 取值范围下限 */
    min: number;
    /** 取值范围上限 */
    max: number;
    /** 值是否需要补零成两位数显示 */
    pad?: boolean;
    /** 是否为星期字段：选项额外标注周几，否则 0-7 看不懂 */
    week_label?: boolean;
    onChange: (f: cron_field) => void;
}

export const CronField: React.FC<CronFieldProps> = ({
    label, field, min, max, pad, week_label, onChange,
}) => {
    const opts = useMemo(() => number_options(min, max, pad), [min, max, pad]);
    // 星期的选项需要额外标注周几
    const value_opts = useMemo(() => {
        if (!week_label) return opts;
        const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];
        return opts.map(o => ({value: o.value, label: `${o.value} (${names[o.value]})`}));
    }, [opts, week_label]);

    /** 切换模式时补齐该模式需要的默认参数 */
    const change_mode = (mode: string) => {
        if (mode === "every") {
            onChange({mode: "every"});
        } else if (mode === "step") {
            onChange({mode: "step", step: field.step ?? 1});
        } else if (mode === "range") {
            onChange({mode: "range", from: field.from ?? min, to: field.to ?? max});
        } else {
            onChange({mode: "list", values: field.values ?? [min]});
        }
    };

    /** 改「指定」里某个下标的值 */
    const set_value_at = (idx: number, nv: number) => {
        const arr = [...(field.values ?? [])];
        arr[idx] = nv;
        onChange({mode: "list", values: arr});
    };

    /** 删「指定」里某个值，删空就回到任意，避免出现空段 */
    const del_value_at = (idx: number) => {
        const arr = (field.values ?? []).filter((_, i) => i !== idx);
        onChange(arr.length ? {mode: "list", values: arr} : {mode: "every"});
    };

    /** 追加一个未使用的值 */
    const add_value = () => {
        const arr = [...(field.values ?? [])];
        const used = new Set(arr);
        let nv = min;
        while (used.has(nv) && nv < max) nv++;
        onChange({mode: "list", values: [...arr, nv]});
    };

    return (
        <div className="cron-field">
            <span className="cron-field__label">{label}</span>
            <Select
                value={field.mode}
                onChange={change_mode}
                options={MODE_OPTIONS}
                no_border={true}
                width={"7.5rem"}
            />
            {field.mode === "step" && (
                <div className="cron-field__param">
                    <span>每</span>
                    <Select
                        value={field.step ?? 1}
                        onChange={(v: number) => onChange({mode: "step", step: v})}
                        options={number_options(1, max)}
                        no_border={true}
                        width={"4.5rem"}
                    />
                    <span>{label}</span>
                </div>
            )}
            {field.mode === "range" && (
                <div className="cron-field__param">
                    <Select
                        value={field.from ?? min}
                        onChange={(v: number) => onChange({mode: "range", from: v, to: field.to ?? max})}
                        options={value_opts}
                        no_border={true}
                        width={"6.5rem"}
                    />
                    <span>到</span>
                    <Select
                        value={field.to ?? max}
                        onChange={(v: number) => onChange({mode: "range", from: field.from ?? min, to: v})}
                        options={value_opts}
                        no_border={true}
                        width={"6.5rem"}
                    />
                </div>
            )}
            {field.mode === "list" && (
                <div className="cron-field__param cron-field__param--list">
                    {/* 指定多个值时逐个下拉添加，已选项可点 × 移除 */}
                    {(field.values ?? []).map((v, idx) => (
                        <span className="cron-tag" key={idx}>
                            <Select
                                value={v}
                                onChange={(nv: number) => set_value_at(idx, nv)}
                                options={value_opts}
                                no_border={true}
                                width={"6.5rem"}
                            />
                            <i
                                className="material-icons cron-tag__del"
                                onClick={() => del_value_at(idx)}
                            >close</i>
                        </span>
                    ))}
                    <i className="material-icons cron-tag__add" onClick={add_value}>add</i>
                </div>
            )}
        </div>
    );
};
