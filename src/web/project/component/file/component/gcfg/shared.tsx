import React from 'react';
import {
    GcfgPageType,
    GcfgFieldType,
} from "../../../../../../common/gcfg.pojo";

// 项目统一颜色变量
export const V = {
    surface: 'var(--surfacePrimary, #ffffff)',
    surface2: 'var(--surfaceSecondary, #f1f3f4)',
    border: 'var(--divider, rgba(0,0,0,0.08))',
    text: 'var(--textPrimary, #202124)',
    text2: 'var(--textSecondary, #5f6368)',
    primary: 'var(--primary, #1a73e8)',
    primaryLight: 'var(--primary-light, #d2e3fc)',
    green: 'var(--secondary, #34a853)',
    red: 'var(--accent, #ea4335)',
    yellow: 'var(--warning, #fbbc04)',
};

export const PageTypeOptions = [
    {value: GcfgPageType.Dict, label: '字典(Dict)'},
    {value: GcfgPageType.TwoDim, label: '二维表(TwoDim)'},
    {value: GcfgPageType.Const, label: '常量(Const)'},
];

export const FieldTypeOptions = [
    {value: GcfgFieldType.String, label: '字符串'},
    {value: GcfgFieldType.Number, label: '数字'},
    {value: GcfgFieldType.Boolean, label: '布尔'},
    {value: GcfgFieldType.StringArray, label: '字符串数组'},
    {value: GcfgFieldType.NumberArray, label: '数字数组'},
    {value: GcfgFieldType.BooleanArray, label: '布尔数组'},
];

/** 校验英文名是否符合代码变量命名规范 */
export function isValidVarName(name: string): boolean {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

// ── 共享样式 ──
export const labelStyle: React.CSSProperties = {color: V.text2, fontSize: 13, marginRight: 4};
export const inputStyle: React.CSSProperties = {
    padding: '6px 10px', borderRadius: 8, border: `1px solid ${V.border}`,
    background: V.surface, color: V.text, fontSize: 13,
};
export const cellInputStyle: React.CSSProperties = {
    padding: '4px 8px', borderRadius: 4, border: `1px solid ${V.border}`,
    background: V.surface, color: V.text, fontSize: 12, width: '100%',
    boxSizing: 'border-box', minWidth: 80,
};
export const tableStyle: React.CSSProperties = {
    width: '100%', borderCollapse: 'collapse', border: `1px solid ${V.border}`,
    fontSize: 13,
};
export const thStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${V.border}`,
    color: V.primary, fontWeight: 'bold',
};
export const tdStyle: React.CSSProperties = {
    padding: '4px 8px', borderBottom: `1px solid ${V.border}`, color: V.text,
};
export const smallBtn: React.CSSProperties = {
    padding: '6px 12px', borderRadius: 8, border: `1px solid ${V.green}`,
    background: 'transparent', color: V.green, cursor: 'pointer', fontSize: 12,
};
export const smallBtnDanger: React.CSSProperties = {
    padding: '4px 8px', borderRadius: 8, border: `1px solid ${V.red}`,
    background: 'transparent', color: V.red, cursor: 'pointer', fontSize: 11,
};

export function btnStyle(active: boolean, color?: string) {
    return {
        padding: '6px 16px',
        border: `1px solid ${color || (active ? V.primary : V.border)}`,
        borderRadius: 8,
        background: active ? V.primaryLight : 'transparent',
        color: active ? V.primary : (color || V.text2),
        cursor: 'pointer',
        fontSize: 13,
    };
}
