import React, {useEffect, useState, useCallback} from 'react';
import {useAtom} from 'jotai';
import {$stroe} from "../../../../util/store";
import {gcfgHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {useTranslation} from "react-i18next";
import {GcfgExportConfig, GcfgFileContent} from "../../../../../../common/gcfg.pojo";

// 项目统一颜色变量（通过 CSS 变量跟随系统四个主题）
// 使用 var(--xxx, fallback) 形式，fallback 为 google 亮色主题值
const V = {
    surface: 'var(--surfacePrimary, #ffffff)',
    surface2: 'var(--surfaceSecondary, #f1f3f4)',
    border: 'var(--divider, rgba(0,0,0,0.08))',
    text: 'var(--textPrimary, #202124)',
    text2: 'var(--textSecondary, #5f6368)',
    primary: 'var(--primary, #1a73e8)',
    primaryLight: 'var(--primary-light, #d2e3fc)',
    green: 'var(--secondary, #34a853)',
    red: 'var(--accent, #ea4335)',
};

interface GcfgDirConfigProps {
    dir: string;
    onOpenFile: (fileName: string) => void;
    onClose: () => void;
}

export default function GcfgDirConfig({dir, onOpenFile, onClose}: GcfgDirConfigProps) {
    const {t} = useTranslation();
    const [files, setFiles] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [exportConfig, setExportConfig] = useState<GcfgExportConfig>({exportDir: '', exportTypes: ['ts']});
    const [showExportSettings, setShowExportSettings] = useState(false);

    // dir 已经是完整的相对路径（如 Downloads/aaa/导表工具测试），不需要再拼
    const dirPath = dir;

    useEffect(() => {
        loadFiles();
        loadExportConfig();
    }, [dir]);

    const loadFiles = async (kw?: string) => {
        try {
            const rsq = await gcfgHttp.post('list', {dir: dirPath, search: kw || search});
            if (rsq.code === 0) setFiles(rsq.data);
        } catch (e) {}
    };

    const loadExportConfig = async () => {
        try {
            const rsq = await gcfgHttp.post('export_config/load', {dir: dirPath});
            if (rsq.code === 0 && rsq.data) setExportConfig(rsq.data);
        } catch (e) {}
    };

    const saveExportConfig = async () => {
        try {
            const rsq = await gcfgHttp.post('export_config/save', {dir: dirPath, config: exportConfig});
            if (rsq.code === 0) {
                NotySuccess(t('导出配置已保存'));
            } else {
                NotyFail(rsq.message);
            }
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    const doExport = async () => {
        if (!exportConfig.exportDir) {
            NotyFail(t('请先设置导出目录'));
            return;
        }
        try {
            const rsq = await gcfgHttp.post('export', {dir: dirPath});
            if (rsq.code === 0) {
                const {generated, errors} = rsq.data;
                let msg = `${t('导出完成')}: ${generated.length} ${t('个文件')}`;
                if (errors.length > 0) msg += `\n${t('错误')}: ${errors.join(', ')}`;
                NotySuccess(msg);
            } else {
                NotyFail(rsq.message);
            }
        } catch (e: any) {
            NotyFail(e?.message);
        }
    };

    const filteredFiles = files.filter(f =>
        !search || f.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: 320, height: '100vh',
            zIndex: 2000, background: V.surface, color: V.text,
            display: 'flex', flexDirection: 'column',
            borderRight: `1px solid ${V.border}`, boxShadow: '2px 0 10px rgba(0,0,0,0.5)',
        }}>
            {/* Header */}
            <div style={{
                padding: '12px 16px', background: V.surface,
                borderBottom: `1px solid ${V.border}`, display: 'flex',
                alignItems: 'center', gap: 8,
            }}>
                <span style={{fontWeight: 'bold', color: V.primary, fontSize: 14}}>📋 {t('配置表')}</span>
                <div style={{flex: 1}}/>
                <button onClick={onClose} style={{
                    background: 'none', border: 'none', color: V.text2,
                    cursor: 'pointer', fontSize: 16,
                }}>✕</button>
            </div>

            {/* Search */}
            <div style={{padding: '8px 12px'}}>
                <input
                    placeholder={t('搜索文件...')}
                    value={search}
                    onChange={e => { setSearch(e.target.value); loadFiles(e.target.value); }}
                    style={{
                        width: '100%', padding: '8px 12px', borderRadius: 8,
                        border: `1px solid ${V.border}`, background: V.surface,
                        color: V.text, fontSize: 13, boxSizing: 'border-box',
                    }}
                />
            </div>

            {/* File List */}
            <div style={{flex: 1, overflow: 'auto', padding: '0 8px'}}>
                {filteredFiles.map(f => (
                    <div key={f}
                         onClick={() => onOpenFile(f)}
                         style={{
                             padding: '10px 12px', cursor: 'pointer', borderRadius: 8,
                             margin: '2px 0', borderBottom: `1px solid ${V.border}`,
                             display: 'flex', alignItems: 'center', gap: 8,
                             transition: 'background 0.2s',
                         }}
                         onMouseEnter={e => (e.currentTarget.style.background = V.surface2)}
                         onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                        <span style={{color: V.primary}}>⚙</span>
                        <span style={{fontSize: 13}}>{f}.gcfg</span>
                    </div>
                ))}
                {filteredFiles.length === 0 && (
                    <p style={{color: V.text2, textAlign: 'center', padding: 20, fontSize: 12}}>
                        {t('此目录下没有 .gcfg 文件')}
                    </p>
                )}
            </div>

            {/* Export Settings */}
            <div style={{
                padding: '8px 12px', borderTop: `1px solid ${V.border}`,
                background: V.surface,
            }}>
                <button onClick={() => setShowExportSettings(!showExportSettings)}
                        style={{
                            width: '100%', padding: '8px', borderRadius: 8,
                            border: `1px solid ${V.primary}`, background: 'transparent',
                            color: V.primary, cursor: 'pointer', fontSize: 13,
                            marginBottom: showExportSettings ? 8 : 0,
                        }}>
                    ⚙ {t('导出设置')}
                </button>

                {showExportSettings && (
                    <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
                        <div>
                            <label style={{color: V.text2, fontSize: 11}}>{t('导出目录')}:</label>
                            <input
                                value={exportConfig.exportDir}
                                onChange={e => setExportConfig(prev => ({...prev, exportDir: e.target.value}))}
                                placeholder="/path/to/export"
                                style={{
                                    width: '100%', padding: '6px 8px', borderRadius: 8,
                                    border: `1px solid ${V.border}`, background: V.surface,
                                    color: V.text, fontSize: 12, boxSizing: 'border-box',
                                    marginTop: 2,
                                }}
                            />
                        </div>
                        <div>
                            <label style={{color: V.text2, fontSize: 11}}>{t('导出语言')}:</label>
                            <div style={{display: 'flex', gap: 8, marginTop: 4}}>
                                {['ts', 'go'].map(lang => (
                                    <label key={lang} style={{color: V.text, fontSize: 12}}>
                                        <input
                                            type="checkbox"
                                            checked={exportConfig.exportTypes.includes(lang as any)}
                                            onChange={e => {
                                                const types = e.target.checked
                                                    ? [...exportConfig.exportTypes, lang as any]
                                                    : exportConfig.exportTypes.filter(t => t !== lang);
                                                setExportConfig(prev => ({...prev, exportTypes: types}));
                                            }}
                                        /> {lang.toUpperCase()}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div style={{display: 'flex', gap: 6}}>
                            <button onClick={saveExportConfig}
                                    style={smallBtn(V.green)}>💾 {t('保存配置')}</button>
                            <button onClick={doExport}
                                    style={smallBtn(V.primary)}>🚀 {t('一键导出')}</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function smallBtn(color: string): React.CSSProperties {
    return {
        flex: 1, padding: '6px 8px', borderRadius: 4,
        border: `1px solid ${color}`, background: 'transparent',
        color, cursor: 'pointer', fontSize: 12
    };
}
