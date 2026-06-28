import React, { useState } from 'react';
import { GcfgPageConfig, GcfgFieldType, GcfgConstKeyDef } from "../../../../../../common/gcfg.pojo";
import {
    V, FieldTypeOptions, isValidVarName,
    inputStyle, labelStyle, smallBtn, smallBtnDanger,
} from './shared';

interface Props {
    cfg: GcfgPageConfig;
    updateConfig: (partial: Partial<GcfgPageConfig>) => void;
    t: (key: string) => string;
}

const tableStyle: React.CSSProperties = {
    width: '100%', borderCollapse: 'collapse', border: `1px solid ${V.border}`, fontSize: 13,
};
const thStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left', borderBottom: `1px solid ${V.border}`,
    color: V.primary, fontWeight: 'bold', background: V.primaryLight,
};
const tdStyle: React.CSSProperties = {
    padding: '4px 8px', borderBottom: `1px solid ${V.border}`, color: V.text,
};

export function ConstConfigPanel({ cfg, updateConfig, t }: Props) {
    const cc = cfg.const_!;
    const keys = cc.keys || [];
    const [newDesc, setNewDesc] = useState('');
    const [newEnName, setNewEnName] = useState('');
    const [newType, setNewType] = useState<GcfgFieldType>(GcfgFieldType.String);

    const updateConstKeys = (newKeys: GcfgConstKeyDef[]) => {
        updateConfig({ const_: { keys: newKeys } });
    };

    const addKey = () => {
        if (!newDesc.trim() || !newEnName.trim()) return;
        if (!isValidVarName(newEnName.trim())) {
            alert(t('英文名不符合变量命名规范'));
            return;
        }
        if (keys.find(k => k.enName === newEnName.trim())) {
            alert(t('该英文名已存在'));
            return;
        }
        const newKey: GcfgConstKeyDef = {
            enName: newEnName.trim(),
            desc: newDesc.trim(),
            valueType: newType,
        };
        updateConstKeys([...keys, newKey]);
        setNewDesc('');
        setNewEnName('');
        setNewType(GcfgFieldType.String);
    };

    const removeKey = (enName: string) => {
        updateConstKeys(keys.filter(k => k.enName !== enName));
    };

    const updateKeyType = (enName: string, valueType: GcfgFieldType) => {
        updateConstKeys(keys.map(k => k.enName === enName ? { ...k, valueType } : k));
    };

    return (
        <div>
            <h3 style={{ color: V.primary, marginTop: 0 }}>{t('常量(Const) 表结构')}</h3>
            <p style={{ color: V.text2, fontSize: 12, marginBottom: 16 }}>
                {t('常量表：每行一个常量，可设置中文名、英文名和各自的值类型。')}
            </p>

            {/* 表名 */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
                <label>
                    <span style={labelStyle}>{t('英文表名')}: </span>
                    <input value={cfg.enName} onChange={e => updateConfig({ enName: e.target.value })}
                        placeholder="CamelCaseName" style={inputStyle} />
                </label>
            </div>

            {/* 常量定义表格 */}
            <h4 style={{ color: V.text }}>{t('常量定义列表')} ({keys.length})</h4>
            <table style={tableStyle}>
                <thead>
                    <tr>
                        <th style={thStyle}>{t('中文名')}</th>
                        <th style={thStyle}>{t('英文名（变量名）')}</th>
                        <th style={thStyle}>{t('值类型')}</th>
                        <th style={thStyle}>{t('操作')}</th>
                    </tr>
                </thead>
                <tbody>
                    {keys.map(k => (
                        <tr key={k.enName}>
                            <td style={tdStyle}>{k.desc}</td>
                            <td style={tdStyle}>
                                <span style={{
                                    color: isValidVarName(k.enName) ? V.green : V.red,
                                    fontFamily: 'monospace',
                                }}>{k.enName || '(空)'}</span>
                            </td>
                            <td style={tdStyle}>
                                <select value={k.valueType} onChange={e => updateKeyType(k.enName, e.target.value as GcfgFieldType)}
                                    style={{ ...inputStyle, fontSize: 12, padding: '4px 8px' }}>
                                    {FieldTypeOptions.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </td>
                            <td style={tdStyle}>
                                <button onClick={() => removeKey(k.enName)} style={smallBtnDanger}>✕</button>
                            </td>
                        </tr>
                    ))}
                    {keys.length === 0 && (
                        <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: V.text2 }}>
                            {t('暂无常量定义，请在下方添加')}
                        </td></tr>
                    )}
                </tbody>
            </table>

            {/* 添加新常量 */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <input placeholder={t('中文名')} value={newDesc}
                    onChange={e => setNewDesc(e.target.value)} style={inputStyle} />
                <input placeholder={t('英文名（如 MAX_HP）')} value={newEnName}
                    onChange={e => setNewEnName(e.target.value)} style={inputStyle} />
                <select value={newType} onChange={e => setNewType(e.target.value as GcfgFieldType)}
                    style={inputStyle}>
                    {FieldTypeOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
                <button onClick={addKey} style={smallBtn}>+ {t('添加常量')}</button>
            </div>
        </div>
    );
}
