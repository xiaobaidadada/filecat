import React, { useState } from 'react';
import { GcfgPageConfig, GcfgFieldType, GcfgTwoDimKeyDef } from "../../../../../../common/gcfg.pojo";
import {
    V, FieldTypeOptions, isValidVarName,
    inputStyle, labelStyle, tableStyle, thStyle, tdStyle, smallBtn, smallBtnDanger
} from './shared';

interface Props {
    cfg: GcfgPageConfig;
    updateConfig: (partial: Partial<GcfgPageConfig>) => void;
    t: (key: string) => string;
}

export function TwoDimConfigPanel({ cfg, updateConfig, t }: Props) {
    const tc = cfg.twoDim!;
    const [newXEnName, setNewXEnName] = useState('');
    const [newXDesc, setNewXDesc] = useState('');
    const [newYEnName, setNewYEnName] = useState('');
    const [newYDesc, setNewYDesc] = useState('');

    const updateTwoDim = (partial: Partial<typeof tc>) => {
        updateConfig({ twoDim: { ...tc, ...partial } });
    };

    const addXKey = () => {
        if (!newXDesc.trim() || !newXEnName.trim()) return;
        if (!isValidVarName(newXEnName.trim())) {
            alert(t('英文名不符合变量命名规范'));
            return;
        }
        if (tc.xKeys.find(k => k.enName === newXEnName.trim())) {
            alert(t('该英文名已存在'));
            return;
        }
        const key: GcfgTwoDimKeyDef = { enName: newXEnName.trim(), desc: newXDesc.trim() };
        updateTwoDim({ xKeys: [...tc.xKeys, key] });
        setNewXEnName('');
        setNewXDesc('');
    };

    const addYKey = () => {
        if (!newYDesc.trim() || !newYEnName.trim()) return;
        if (!isValidVarName(newYEnName.trim())) {
            alert(t('英文名不符合变量命名规范'));
            return;
        }
        if (tc.yKeys.find(k => k.enName === newYEnName.trim())) {
            alert(t('该英文名已存在'));
            return;
        }
        const key: GcfgTwoDimKeyDef = { enName: newYEnName.trim(), desc: newYDesc.trim() };
        updateTwoDim({ yKeys: [...tc.yKeys, key] });
        setNewYEnName('');
        setNewYDesc('');
    };

    const removeXKey = (enName: string) => {
        updateTwoDim({ xKeys: tc.xKeys.filter(k => k.enName !== enName) });
    };

    const removeYKey = (enName: string) => {
        updateTwoDim({ yKeys: tc.yKeys.filter(k => k.enName !== enName) });
    };

    return (
        <div>
            <h3 style={{ color: V.primary, marginTop: 0 }}>{t('二维表(TwoDim) 表结构')}</h3>
            <p style={{ color: V.text2, fontSize: 12, marginBottom: 16 }}>
                {t('二维表：X 轴 keys（列头）× Y 轴 keys（行头），用户在表格中填入对应的 value。')}
            </p>

            {/* 表名 */}
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
                <label>
                    <span style={labelStyle}>{t('英文表名')}: </span>
                    <input value={cfg.enName} onChange={e => updateConfig({ enName: e.target.value })}
                        placeholder="CamelCaseName" style={inputStyle} />
                </label>
            </div>

            {/* Value类型 */}
            <div style={{ marginBottom: 16 }}>
                <label>
                    <span style={labelStyle}>{t('Value 类型')}: </span>
                    <select value={tc.valueType} onChange={e => updateTwoDim({ valueType: e.target.value as GcfgFieldType })}
                        style={inputStyle}>
                        {FieldTypeOptions.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </label>
            </div>

            {/* X 轴 Keys */}
            <div style={{ marginBottom: 20 }}>
                <h4 style={{ color: V.text }}>
                    {t('X 轴 Keys（列头）')} ({tc.xKeys.length})
                    <span style={{ color: V.text2, fontSize: 11, marginLeft: 8 }}>{t('每个 X key 类型为 string，都展示在列头')}</span>
                </h4>
                <table style={tableStyle}>
                    <thead>
                        <tr style={{ background: V.primaryLight }}>
                            <th style={thStyle}>{t('中文名')}</th>
                            <th style={thStyle}>{t('英文名')}</th>
                            <th style={thStyle}>{t('类型')}</th>
                            <th style={thStyle}>{t('操作')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tc.xKeys.map(k => (
                            <tr key={k.enName}>
                                <td style={tdStyle}>{k.desc}</td>
                                <td style={tdStyle}>
                                    <span style={{ fontFamily: 'monospace', color: V.primary }}>{k.enName}</span>
                                </td>
                                <td style={tdStyle}>string</td>
                                <td style={tdStyle}>
                                    <button onClick={() => removeXKey(k.enName)} style={smallBtnDanger}>✕</button>
                                </td>
                            </tr>
                        ))}
                        {tc.xKeys.length === 0 && (
                            <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: V.text2 }}>
                                {t('暂无 X 轴 key')}
                            </td></tr>
                        )}
                    </tbody>
                </table>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <input placeholder={t('中文名')} value={newXDesc}
                        onChange={e => setNewXDesc(e.target.value)} style={inputStyle} />
                    <input placeholder={t('英文名（如 heroId）')} value={newXEnName}
                        onChange={e => setNewXEnName(e.target.value)} style={inputStyle} />
                    <button onClick={addXKey} style={smallBtn}>+ {t('添加 X Key')}</button>
                </div>
            </div>

            {/* Y 轴 Keys */}
            <div>
                <h4 style={{ color: V.text }}>
                    {t('Y 轴 Keys（行头）')} ({tc.yKeys.length})
                    <span style={{ color: V.text2, fontSize: 11, marginLeft: 8 }}>{t('每个 Y key 类型为 string，都展示在行头')}</span>
                </h4>
                <table style={tableStyle}>
                    <thead>
                        <tr style={{ background: V.primaryLight }}>
                            <th style={thStyle}>{t('中文名')}</th>
                            <th style={thStyle}>{t('英文名')}</th>
                            <th style={thStyle}>{t('类型')}</th>
                            <th style={thStyle}>{t('操作')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {tc.yKeys.map(k => (
                            <tr key={k.enName}>
                                <td style={tdStyle}>{k.desc}</td>
                                <td style={tdStyle}>
                                    <span style={{ fontFamily: 'monospace', color: V.primary }}>{k.enName}</span>
                                </td>
                                <td style={tdStyle}>string</td>
                                <td style={tdStyle}>
                                    <button onClick={() => removeYKey(k.enName)} style={smallBtnDanger}>✕</button>
                                </td>
                            </tr>
                        ))}
                        {tc.yKeys.length === 0 && (
                            <tr><td colSpan={4} style={{ ...tdStyle, textAlign: 'center', color: V.text2 }}>
                                {t('暂无 Y 轴 key')}
                            </td></tr>
                        )}
                    </tbody>
                </table>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                    <input placeholder={t('中文名')} value={newYDesc}
                        onChange={e => setNewYDesc(e.target.value)} style={inputStyle} />
                    <input placeholder={t('英文名（如 itemId）')} value={newYEnName}
                        onChange={e => setNewYEnName(e.target.value)} style={inputStyle} />
                    <button onClick={addYKey} style={smallBtn}>+ {t('添加 Y Key')}</button>
                </div>
            </div>
        </div>
    );
}
