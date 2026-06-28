import React, { useState } from 'react';
import { GcfgPageConfig, GcfgDictData, GcfgDictKeyDef } from "../../../../../../common/gcfg.pojo";
import {
    V, inputStyle, smallBtn, smallBtnDanger,
} from './shared';

interface Props {
    cfg: GcfgPageConfig;
    data: GcfgDictData;
    updateData: (data: GcfgDictData) => void;
    t: (key: string) => string;
}

// ── 表格样式 ──
const tableWrapStyle: React.CSSProperties = {
    overflowX: 'auto', width: '100%',
    border: `1px solid ${V.border}`, borderRadius: 8,
};

const dataTableStyle: React.CSSProperties = {
    width: '100%', borderCollapse: 'collapse',
    fontSize: 13, minWidth: 600,
};

const dataThStyle: React.CSSProperties = {
    padding: '8px 12px', textAlign: 'left',
    borderBottom: `2px solid ${V.border}`,
    background: V.primaryLight, color: V.primary,
    fontWeight: 'bold', whiteSpace: 'nowrap',
    position: 'sticky', top: 0,
};

const dataTdStyle: React.CSSProperties = {
    padding: '2px 4px', borderBottom: `1px solid ${V.border}`,
};

const cellInput: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: 6,
    border: `1px solid transparent`, background: 'transparent',
    color: V.text, fontSize: 13, boxSizing: 'border-box',
    minWidth: 100,
};

const newRowInput: React.CSSProperties = {
    width: '100%', padding: '6px 8px', borderRadius: 6,
    border: `1px dashed ${V.primary}`, background: V.surface,
    color: V.text, fontSize: 13, boxSizing: 'border-box',
    minWidth: 100,
};

function getPlaceholder(k: GcfgDictKeyDef): string {
    return k.desc || k.enName;
}

export function DictDataPanel({ cfg, data, updateData, t }: Props) {
    const dict = cfg.dict!;
    const keys = dict.keys;
    const rows: Record<string, string>[] = data?.rows || [];
    const [newRow, setNewRow] = useState<Record<string, string>>({});

    if (keys.length === 0) {
        return <p style={{ color: V.text2 }}>{t('请先在表结构中添加列定义')}</p>;
    }

    const addRow = () => {
        // 至少编号列要有值
        const idVal = (newRow['id'] || '').trim();
        if (!idVal) return;

        const row: Record<string, string> = {};
        for (const k of keys) {
            row[k.enName] = newRow[k.enName] || '';
        }
        updateData({ rows: [...rows, row] });
        setNewRow({});
    };

    const removeRow = (idx: number) => {
        updateData({ rows: rows.filter((_, i) => i !== idx) });
    };

    const updateCell = (idx: number, enName: string, val: string) => {
        const newRows = rows.map((row, i) => {
            if (i !== idx) return row;
            return { ...row, [enName]: val };
        });
        updateData({ rows: newRows });
    };

    const setNewCell = (enName: string, val: string) => {
        setNewRow(prev => ({ ...prev, [enName]: val }));
    };

    const handleNewKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') addRow();
    };

    return (
        <div>
            <h3 style={{ color: V.primary, marginTop: 0 }}>{t('字典数据编辑')}</h3>
            <p style={{ color: V.text2, fontSize: 12, marginBottom: 12 }}>
                {t('表格式编辑：表头为各列定义，每行填写各列的值。编号列不可为空。')}
            </p>

            <div style={tableWrapStyle}>
                <table style={dataTableStyle}>
                    {/* 表头：各列 key */}
                    <thead>
                        <tr>
                            <th style={{ ...dataThStyle, width: 60 }}>#</th>
                            {keys.map(k => (
                                <th key={k.enName} style={dataThStyle}>
                                    <div>{k.desc || k.enName}</div>
                                    <div style={{ fontSize: 10, fontWeight: 'normal', color: V.text2 }}>
                                        {k.enName} ({k.valueType})
                                    </div>
                                </th>
                            ))}
                            <th style={{ ...dataThStyle, width: 60 }}>{t('操作')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* 新增行 */}
                        <tr style={{ background: V.surface2 }}>
                            <td style={{ ...dataTdStyle, textAlign: 'center', color: V.text2 }}>+</td>
                            {keys.map(k => (
                                <td key={k.enName} style={dataTdStyle}>
                                    <input
                                        value={newRow[k.enName] || ''}
                                        onChange={e => setNewCell(k.enName, e.target.value)}
                                        onKeyDown={handleNewKeyDown}
                                        placeholder={getPlaceholder(k)}
                                        style={newRowInput}
                                    />
                                </td>
                            ))}
                            <td style={{ ...dataTdStyle, textAlign: 'center' }}>
                                <button onClick={addRow} style={smallBtn}>+</button>
                            </td>
                        </tr>

                        {/* 已有数据行 */}
                        {rows.map((row, idx) => (
                            <tr key={idx}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLElement).style.background = V.primaryLight;
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.background = '';
                                }}
                            >
                                <td style={{ ...dataTdStyle, textAlign: 'center', color: V.text2, fontSize: 12 }}>
                                    {idx + 1}
                                </td>
                                {keys.map(k => (
                                    <td key={k.enName} style={dataTdStyle}>
                                        <input
                                            value={row[k.enName] || ''}
                                            onChange={e => updateCell(idx, k.enName, e.target.value)}
                                            placeholder={getPlaceholder(k)}
                                            style={{
                                                ...cellInput,
                                                borderColor: 'transparent',
                                            }}
                                            onFocus={e => {
                                                e.target.style.border = `1px solid ${V.primary}`;
                                                e.target.style.background = V.surface;
                                            }}
                                            onBlur={e => {
                                                e.target.style.border = '1px solid transparent';
                                                e.target.style.background = 'transparent';
                                            }}
                                        />
                                    </td>
                                ))}
                                <td style={{ ...dataTdStyle, textAlign: 'center' }}>
                                    <button onClick={() => removeRow(idx)} style={smallBtnDanger}>✕</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {rows.length === 0 && (
                <div style={{ textAlign: 'center', color: V.text2, padding: 20 }}>
                    {t('暂无数据，请在上方添加行')}
                </div>
            )}
        </div>
    );
}
