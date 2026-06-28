import React, { useState } from 'react';
import { GcfgPageConfig, GcfgFieldType, GcfgDictKeyDef } from "../../../../../../common/gcfg.pojo";
import {
    V, FieldTypeOptions, isValidVarName,
    inputStyle, labelStyle, tableStyle, thStyle, tdStyle, smallBtn, smallBtnDanger
} from './shared';

interface Props {
    cfg: GcfgPageConfig;
    updateConfig: (partial: Partial<GcfgPageConfig>) => void;
    t: (key: string) => string;
}

/** 确保第一列永远是「编号」(id)，类型固定 string */
function ensureIdColumn(keys: GcfgDictKeyDef[]): GcfgDictKeyDef[] {
    if (keys.length === 0 || keys[0].enName !== 'id') {
        const idCol: GcfgDictKeyDef = { enName: 'id', desc: '编号', valueType: GcfgFieldType.String };
        return [idCol, ...keys.filter(k => k.enName !== 'id')];
    }
    // 确保第一列的 id 列类型始终是 string
    const first = keys[0];
    if (first.valueType !== GcfgFieldType.String || first.desc !== '编号') {
        const fixed = [{ ...first, desc: '编号', valueType: GcfgFieldType.String }, ...keys.slice(1).filter(k => k.enName !== 'id')];
        return fixed;
    }
    return keys;
}

export function DictConfigPanel({ cfg, updateConfig, t }: Props) {
    const dict = cfg.dict!;
    const keys = ensureIdColumn(dict.keys);
    // 同步回 config（如果被修正了）
    if (keys !== dict.keys) {
        updateConfig({ dict: { keys } });
    }

    const [newEnName, setNewEnName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newType, setNewType] = useState<GcfgFieldType>(GcfgFieldType.String);

    const updateDict = (partial: Partial<typeof dict>) => {
        updateConfig({ dict: { ...dict, ...partial } });
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
        const newKey: GcfgDictKeyDef = {
            enName: newEnName.trim(),
            desc: newDesc.trim(),
            valueType: newType,
        };
        updateDict({ keys: [...keys, newKey] });
        setNewEnName('');
        setNewDesc('');
        setNewType(GcfgFieldType.String);
    };

    const removeKey = (enName: string) => {
        // 不允许删除第一列「编号」
        if (enName === 'id') {
            alert(t('编号列不可删除'));
            return;
        }
        updateDict({ keys: keys.filter(k => k.enName !== enName) });
    };

    const updateKeyType = (enName: string, newValueType: GcfgFieldType) => {
        // 编号列类型不可改
        if (enName === 'id') return;
        updateDict({
            keys: keys.map(k => k.enName === enName ? { ...k, valueType: newValueType } : k),
        });
    };

    return (
        <div>
            <h3 style={{ color: V.primary, marginTop: 0 }}>{t('字典(Dict) 表结构')}</h3>
            <p style={{ color: V.text2, fontSize: 12, marginBottom: 16 }}>
                {t('字典表：第一列固定为「编号」(id)，类型为字符串。可添加更多列并选择类型。每行数据填写各列的值。')}
            </p>

            {/* 表名 */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
                <label>
                    <span style={labelStyle}>{t('英文表名')}: </span>
                    <input value={cfg.enName} onChange={e => updateConfig({ enName: e.target.value })}
                        placeholder="CamelCaseName" style={inputStyle} />
                </label>
            </div>

            {/* 列定义列表 */}
            <h4 style={{ color: V.text }}>{t('列定义')} ({keys.length})</h4>
            <table style={tableStyle}>
                <thead>
                    <tr style={{ background: V.primaryLight }}>
                        <th style={thStyle}>{t('中文名')}</th>
                        <th style={thStyle}>{t('英文名（变量名）')}</th>
                        <th style={thStyle}>{t('类型')}</th>
                        <th style={thStyle}>{t('操作')}</th>
                    </tr>
                </thead>
                <tbody>
                    {keys.map((k, idx) => (
                        <tr key={k.enName}>
                            <td style={tdStyle}>
                                {idx === 0 ? (
                                    <span style={{ fontWeight: 'bold', color: V.primary }}>🔒 {k.desc}</span>
                                ) : (
                                    k.desc
                                )}
                            </td>
                            <td style={tdStyle}>
                                <span style={{
                                    color: isValidVarName(k.enName) ? V.green : V.red,
                                    fontFamily: 'monospace',
                                }}>{k.enName || '(空)'}</span>
                            </td>
                            <td style={tdStyle}>
                                {idx === 0 ? (
                                    <span style={{ color: V.text2, fontSize: 12 }}>字符串 (固定)</span>
                                ) : (
                                    <select
                                        value={k.valueType}
                                        onChange={e => updateKeyType(k.enName, e.target.value as GcfgFieldType)}
                                        style={{ ...inputStyle, padding: '2px 6px', fontSize: 12 }}
                                    >
                                        {FieldTypeOptions.map(o => (
                                            <option key={o.value} value={o.value}>{o.label}</option>
                                        ))}
                                    </select>
                                )}
                            </td>
                            <td style={tdStyle}>
                                {idx === 0 ? (
                                    <span style={{ color: V.text2, fontSize: 11 }}>{t('固定列')}</span>
                                ) : (
                                    <button onClick={() => removeKey(k.enName)} style={smallBtnDanger}>✕</button>
                                )}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* 添加新列 */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <input placeholder={t('中文名')} value={newDesc}
                    onChange={e => setNewDesc(e.target.value)} style={inputStyle} />
                <input placeholder={t('英文名（必需，如 heroId）')} value={newEnName}
                    onChange={e => setNewEnName(e.target.value)} style={inputStyle} />
                <select value={newType} onChange={e => setNewType(e.target.value as GcfgFieldType)}
                    style={inputStyle}>
                    {FieldTypeOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                </select>
                <button onClick={addKey} style={smallBtn}>+ {t('添加列')}</button>
            </div>
        </div>
    );
}
