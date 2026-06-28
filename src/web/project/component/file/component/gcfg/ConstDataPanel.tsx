import React from 'react';
import { GcfgPageConfig, GcfgConstData } from "../../../../../../common/gcfg.pojo";
import {
    V, inputStyle,
} from './shared';

interface Props {
    cfg: GcfgPageConfig;
    data: GcfgConstData;
    updateData: (data: GcfgConstData) => void;
    t: (key: string) => string;
}

const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
    padding: '6px 8px', borderRadius: 8, background: V.surface,
    border: `1px solid ${V.border}`,
};

const keyLabelStyle: React.CSSProperties = {
    width: 160, minWidth: 160, fontFamily: 'monospace', fontWeight: 'bold',
    color: V.primary, fontSize: 13, wordBreak: 'break-all',
    padding: '4px 8px', background: V.primaryLight, borderRadius: 4,
    flexShrink: 0,
};

const descLabelStyle: React.CSSProperties = {
    fontSize: 11, color: V.text2, minWidth: 80, flexShrink: 0,
};

const valueInputStyle: React.CSSProperties = {
    flex: 1, padding: '6px 10px', borderRadius: 8,
    border: `1px solid ${V.border}`, background: V.surface, color: V.text,
    fontSize: 13, minWidth: 120,
};

const typeBadgeStyle: React.CSSProperties = {
    fontSize: 10, color: V.text2, background: V.surface2,
    padding: '2px 6px', borderRadius: 4, flexShrink: 0,
};

export function ConstDataPanel({ cfg, data, updateData, t }: Props) {
    const keys = cfg.const_!.keys || [];
    const values = data?.values || {};

    const updateValue = (enName: string, value: string) => {
        updateData({ values: { ...values, [enName]: value } });
    };

    if (keys.length === 0) {
        return <p style={{ color: V.text2 }}>{t('请先在表结构中添加常量定义')}</p>;
    }

    return (
        <div>
            <h3 style={{ color: V.primary, marginTop: 0 }}>{t('常量数据编辑')}</h3>
            <p style={{ color: V.text2, fontSize: 12, marginBottom: 12 }}>
                {t('根据表结构中定义的常量，为每个常量输入对应的值。')}
            </p>

            {keys.map(k => (
                <div key={k.enName} style={rowStyle}>
                    <div style={keyLabelStyle} title={k.enName}>{k.enName}</div>
                    <div style={descLabelStyle}>{k.desc}</div>
                    <input
                        value={values[k.enName] || ''}
                        onChange={e => updateValue(k.enName, e.target.value)}
                        style={valueInputStyle}
                        placeholder={`${k.desc || k.enName}`}
                    />
                    <span style={typeBadgeStyle}>{k.valueType}</span>
                </div>
            ))}
        </div>
    );
}
