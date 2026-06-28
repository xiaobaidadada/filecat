import React from 'react';
import { GcfgPageConfig, GcfgTwoDimData } from "../../../../../../common/gcfg.pojo";
import {
    V, cellInputStyle, tableStyle, thStyle, tdStyle,
} from './shared';

interface Props {
    cfg: GcfgPageConfig;
    data: GcfgTwoDimData;
    updateData: (data: GcfgTwoDimData) => void;
    t: (key: string) => string;
}

export function TwoDimDataPanel({ cfg, data, updateData, t }: Props) {
    const tc = cfg.twoDim!;
    const xKeys = tc.xKeys;
    const yKeys = tc.yKeys;

    if (xKeys.length === 0 || yKeys.length === 0) {
        return <p style={{ color: V.text2 }}>{t('请先在表结构中添加 X 轴和 Y 轴的 key')}</p>;
    }

    // cells 结构: { xKeyEnName: { yKeyEnName: valueString } }
    const cells = data?.cells || {};

    // 固定 n*m：列数 = xKeys.length，行数 = yKeys.length
    // 使用 enName 作为行列的唯一标识

    const updateCell = (xKeyEnName: string, yKeyEnName: string, val: string) => {
        const newCells = { ...cells };
        if (!newCells[xKeyEnName]) newCells[xKeyEnName] = {};
        newCells[xKeyEnName] = { ...newCells[xKeyEnName], [yKeyEnName]: val };
        // 清理空值但保留结构
        if (val === '' && Object.keys(newCells[xKeyEnName]).every(k => !newCells[xKeyEnName][k])) {
            delete newCells[xKeyEnName];
        }
        updateData({ cells: newCells });
    };

    const cellWidth = Math.max(100, 120);

    return (
        <div>
            <h3 style={{ color: V.primary, marginTop: 0 }}>{t('二维表数据编辑')}</h3>
            <p style={{ color: V.text2, fontSize: 12, marginBottom: 8 }}>
                {t('X 轴（列头）：')}{xKeys.map(k => k.desc).join(', ')}
                {' | '}
                {t('Y 轴（行头）：')}{yKeys.map(k => k.desc).join(', ')}
                {' | Value类型：'}{tc.valueType}
            </p>
            <div style={{ overflow: 'auto' }}>
                <table style={{ ...tableStyle, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr>
                            {/* 左上角空白 */}
                            <th style={{ ...thStyle, background: V.surface2, minWidth: 140 }}>
                                <span style={{ fontSize: 11, color: V.text2 }}>Y ↓ / X →</span>
                            </th>
                            {/* X轴列头: 显示每个xKey的desc和enName */}
                            {xKeys.map(xk => (
                                <th key={xk.enName} style={{ ...thStyle, minWidth: cellWidth, background: V.primaryLight, textAlign: 'center' }}>
                                    <div style={{ fontWeight: 'bold' }}>{xk.desc}</div>
                                    <div style={{ fontSize: 11, color: V.text2, fontFamily: 'monospace' }}>{xk.enName}</div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {yKeys.map(yk => (
                            <tr key={yk.enName}>
                                {/* Y轴行头: 显示每个yKey的desc和enName */}
                                <td style={{ ...tdStyle, background: V.primaryLight, fontWeight: 'bold' }}>
                                    <div>{yk.desc}</div>
                                    <div style={{ fontSize: 11, color: V.text2, fontFamily: 'monospace' }}>{yk.enName}</div>
                                </td>
                                {/* 每个交叉单元格: 用户只需填写value */}
                                {xKeys.map(xk => (
                                    <td key={xk.enName} style={tdStyle}>
                                        <input
                                            value={cells[xk.enName]?.[yk.enName] || ''}
                                            onChange={e => updateCell(xk.enName, yk.enName, e.target.value)}
                                            placeholder={tc.valueType}
                                            style={cellInputStyle}
                                        />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
