import React, {useEffect, useState, useCallback, useRef} from 'react';
import {useAtom} from 'jotai';
import {$stroe} from "../../../../util/store";
import {gcfgHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {useTranslation} from "react-i18next";
import {
    GcfgPageType,
    GcfgFieldType,
    GcfgPageConfig,
    GcfgFileContent,
    GcfgConstData,
    GcfgDictData,
    GcfgTwoDimData,
} from "../../../../../../common/gcfg.pojo";
import {V, btnStyle, isValidVarName, PageTypeOptions} from './shared';
import {DictConfigPanel} from './DictConfigPanel';
import {TwoDimConfigPanel} from './TwoDimConfigPanel';
import {ConstConfigPanel} from './ConstConfigPanel';
import {DictDataPanel} from './DictDataPanel';
import {TwoDimDataPanel} from './TwoDimDataPanel';
import {ConstDataPanel} from './ConstDataPanel';

function emptyContent(): GcfgFileContent {
    return {
        config: {
            type: GcfgPageType.Dict,
            enName: '',
            dict: { keys: [{ enName: 'id', desc: '编号', valueType: 'string' as GcfgFieldType }] },
        },
    };
}

/** 初始化默认config */
function ensureConfigByType(cfg: GcfgPageConfig): GcfgPageConfig {
    const c = {...cfg};
    switch (c.type) {
        case GcfgPageType.Const:
            if (!c.const_) c.const_ = { keys: [] };
            break;
        case GcfgPageType.Dict:
            if (!c.dict) c.dict = { keys: [{ enName: 'id', desc: '编号', valueType: 'string' as GcfgFieldType }] };
            break;
        case GcfgPageType.TwoDim:
            if (!c.twoDim) c.twoDim = { xKeys: [], yKeys: [], valueType: GcfgFieldType.String };
            break;
    }
    return c;
}

export default function GcfgEditor() {
    const [gcfgEditor, setGcfgEditor] = useAtom($stroe.gcfg_editor);
    const {t} = useTranslation();
    const [content, setContent] = useState<GcfgFileContent>(emptyContent());
    const [loading, setLoading] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [activeTab, setActiveTab] = useState<'config' | 'data'>('config');

    const filePath = gcfgEditor.path;
    const fileName = gcfgEditor.name;
    // 区分已有文件 vs 新建文件：已有文件不允许修改类型
    const [isExistingFile, setIsExistingFile] = useState(false);

    useEffect(() => {
        if (!filePath) return;
        loadFile();
    }, [filePath]);

    const getAbsPath = () => filePath || '';

    const loadFile = async () => {
        setLoading(true);
        try {
            const rsq = await gcfgHttp.post('load', {path: getAbsPath()});
            if (rsq.code === 0) {
                const cfg = ensureConfigByType(rsq.data.config);
                const data = rsq.data.data || {};
                setContent({config: cfg, data});
                setIsExistingFile(true);
            } else {
                setContent(emptyContent());
                setIsExistingFile(false);
            }
        } catch (e) {
            setContent(emptyContent());
            setIsExistingFile(false);
        }
        setLoading(false);
    };

    const saveFile = async () => {
        const cfg = content.config;
        if (!cfg.enName || !isValidVarName(cfg.enName)) {
            NotyFail(t('英文表名不符合变量命名规范'));
            return;
        }
        try {
            const rsq = await gcfgHttp.post('save', {path: getAbsPath(), content});
            if (rsq.code === 0) {
                NotySuccess(t('保存成功'));
                setDirty(false);
            } else {
                NotyFail(rsq.message || t('保存失败'));
            }
        } catch (e: any) {
            NotyFail(e?.message || t('保存失败'));
        }
    };

    const markDirty = () => setDirty(true);

    const updateConfig = (partial: Partial<GcfgPageConfig>) => {
        // 已有文件不允许修改 type
        if (isExistingFile && partial.type !== undefined && partial.type !== content.config.type) {
            NotyFail(t('文件已创建，表结构类型不可修改'));
            return;
        }
        setContent(prev => ({
            ...prev,
            config: ensureConfigByType({...prev.config, ...partial}),
        }));
        markDirty();
    };

    const updateData = (newData: any) => {
        setContent(prev => ({...prev, data: newData}));
        markDirty();
    };

    const close = () => {
        if (dirty) {
            if (!window.confirm(t('有未保存的更改，确定关闭吗？'))) return;
        }
        setGcfgEditor({open: false});
        gcfgEditor.close?.();
    };

    const cfg = content.config;

    if (loading) return <div style={{padding: 20, color: V.text2}}>Loading...</div>;

    const renderConfigPanel = () => {
        switch (cfg.type) {
            case GcfgPageType.Dict:
                return <DictConfigPanel cfg={cfg} updateConfig={updateConfig} t={t} />;
            case GcfgPageType.TwoDim:
                return <TwoDimConfigPanel cfg={cfg} updateConfig={updateConfig} t={t} />;
            case GcfgPageType.Const:
                return <ConstConfigPanel cfg={cfg} updateConfig={updateConfig} t={t} />;
            default:
                return <DictConfigPanel cfg={cfg} updateConfig={updateConfig} t={t} />;
        }
    };

    const renderDataPanel = () => {
        const data = content.data;
        switch (cfg.type) {
            case GcfgPageType.Dict:
                return <DictDataPanel cfg={cfg} data={data as GcfgDictData} updateData={updateData} t={t} />;
            case GcfgPageType.TwoDim:
                return <TwoDimDataPanel cfg={cfg} data={data as GcfgTwoDimData} updateData={updateData} t={t} />;
            case GcfgPageType.Const:
                return <ConstDataPanel cfg={cfg} data={data as GcfgConstData} updateData={updateData} t={t} />;
            default:
                return <DictDataPanel cfg={cfg} data={data as GcfgDictData} updateData={updateData} t={t} />;
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            zIndex: 2000, background: V.surface, color: V.text,
            display: 'flex', flexDirection: 'column',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', padding: '8px 16px',
                background: V.surface, borderBottom: `1px solid ${V.border}`,
                gap: 12, flexShrink: 0,
            }}>
                <span style={{fontWeight: 'bold', fontSize: 16, color: V.primary}}>⚙ Gcfg Editor</span>
                <span style={{color: V.text2}}>{fileName}</span>
                {/* 类型标签（不可修改） */}
                <span style={{
                    padding: '3px 10px', borderRadius: 12, fontSize: 12,
                    background: V.primaryLight, color: V.primary,
                    border: `1px solid ${V.primary}`,
                    display: 'flex', alignItems: 'center', gap: 4,
                }}>
                    {isExistingFile ? '🔒' : '🔓'} {PageTypeOptions.find(o => o.value === cfg.type)?.label || cfg.type}
                </span>
                <div style={{flex: 1}}/>
                <button onClick={() => setActiveTab('config')}
                        style={btnStyle(activeTab === 'config')}>{t('表结构')}</button>
                <button onClick={() => setActiveTab('data')}
                        style={btnStyle(activeTab === 'data')}>{t('数据')}</button>
                <button onClick={saveFile} style={btnStyle(false, V.green)}>💾 {t('保存')} {dirty ? '●' : ''}</button>
                <button onClick={close} style={btnStyle(false, V.red)}>✕ {t('关闭')}</button>
            </div>

            {/* Body */}
            <div style={{flex: 1, overflow: 'auto', padding: 16}}>
                {activeTab === 'config' && renderConfigPanel()}
                {activeTab === 'data' && renderDataPanel()}
            </div>
        </div>
    );
}
