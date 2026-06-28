import React, {useEffect, useState, useCallback, useRef, Suspense} from 'react';
import {useAtom} from 'jotai';
import {$stroe} from "../../../../util/store";
import {gcfgHttp} from "../../../../util/config";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {useTranslation} from "react-i18next";
import {ActionButton} from "../../../../../meta/component/Button";
import Header from "../../../../../meta/component/Header";
import {useLocation, useNavigate} from "react-router-dom";
import {GcfgExportConfig} from "../../../../../../common/gcfg.pojo";
import {routerConfig} from "../../../../../../common/RouterConfig";
import {getRouterAfter, getRouterPath} from "../../../../util/WebPath";
import * as lodash from "lodash";

// 复用 shared 中的颜色变量
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

const GcfgEditor = React.lazy(() => import('./GcfgEditor'));

export default function GcfgStudio() {
    const {t} = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    // 从 URL 解析目录路径: /gcfg_page/{encoded_dir}
    // 使用 getRouterAfter 和 Studio.tsx 保持一致的方式提取路径
    const dirPath = decodeURIComponent(getRouterAfter(routerConfig.gcfg_page, getRouterPath()));

    const [files, setFiles] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [activeFile, setActiveFile] = useState<string | null>(null);
    const [exportConfig, setExportConfig] = useState<GcfgExportConfig>({exportDir: '', exportTypes: ['ts']});
    const [showExportSettings, setShowExportSettings] = useState(false);
    const [navWidth, setNavWidth] = useState(16);

    const studioDividerRef = useRef(null);
    const studioNavRef = useRef(null);
    const [drag, setDrag] = useState(false);

    // 从 URL 读取当前编辑的文件
    const searchParams = new URLSearchParams(location.search);
    const editFileFromUrl = searchParams.get('edit') || '';

    useEffect(() => {
        if (editFileFromUrl) {
            setActiveFile(editFileFromUrl);
        }
    }, [editFileFromUrl]);

    useEffect(() => {
        if (!dirPath) return;
        loadFiles();
        loadExportConfig();
    }, [dirPath]);

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

    const openFile = (fileName: string) => {
        setActiveFile(fileName);
        // 同步更新 URL 参数，支持刷新持久化
        const params = new URLSearchParams(location.search);
        params.set('edit', fileName);
        navigate(`${location.pathname}?${params.toString()}`, {replace: true});
    };

    const closeEditor = () => {
        setActiveFile(null);
        const params = new URLSearchParams(location.search);
        params.delete('edit');
        navigate(`${location.pathname}?${params.toString()}`, {replace: true});
    };

    const cancel = () => {
        navigate(-1);
    };

    const filteredFiles = files.filter(f =>
        !search || f.toLowerCase().includes(search.toLowerCase())
    );

    // 拖拽调整面板大小
    const handleDrag = useCallback(lodash.throttle((event) => {
        const size = parseFloat(getComputedStyle(studioNavRef.current).fontSize);
        const left = window.innerWidth / size - 4;
        const userPos = event.clientX / size;
        const right = 2.25 + studioDividerRef.current.offsetWidth / size;
        if (userPos <= left && userPos >= right) {
            setNavWidth(parseFloat(userPos.toFixed(2)));
        }
    }, 32), []);

    const handlePointerDown = () => {
        setDrag(true);
        studioNavRef.current.addEventListener("pointermove", handleDrag);
    };
    const handlePointerup = () => {
        setDrag(false);
        studioNavRef.current.removeEventListener("pointermove", handleDrag);
    };

    // 左侧面板 + 右侧编辑器（类似 Studio 的布局）
    return (
        <div className={"studio"}>
            <Header ignore_tags={true}
                    left_children={[
                        <ActionButton key={1} title={t("取消")} icon={"close"} onClick={cancel}/>,
                        <title key={2}>📋 {t('配置表')} - {decodeURIComponent((dirPath.split('/').filter(Boolean).pop() || dirPath).replace(/\/$/, ''))}</title>
                    ]}>
            </Header>
            <div className={"studio-body"} ref={studioNavRef}>
                <div className={"studio-nav"} style={{width: `${navWidth - 1}em`}}>
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
                                 onClick={() => openFile(f)}
                                 style={{
                                     padding: '10px 12px', cursor: 'pointer', borderRadius: 8,
                                     margin: '2px 0', borderBottom: `1px solid ${V.border}`,
                                     display: 'flex', alignItems: 'center', gap: 8,
                                     transition: 'background 0.2s',
                                     background: activeFile === f ? V.primaryLight : 'transparent',
                                 }}
                                 onMouseEnter={e => (e.currentTarget.style.background = V.surface2)}
                                 onMouseLeave={e => (e.currentTarget.style.background = activeFile === f ? V.primaryLight : 'transparent')}
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
                <div className={"studio__divider"} ref={studioDividerRef} onPointerDown={handlePointerDown}
                     onPointerUp={handlePointerup}/>
                {drag &&
                    <div className="shell__overlay" onPointerUp={handlePointerup}/>
                }
                <div className={"studio-editor"} key={activeFile || 'placeholder'}>
                    {activeFile ? (
                        <Suspense fallback={<div></div>}>
                            <GcfgEditor
                                filePath={`${dirPath}${activeFile}.gcfg`}
                                fileName={`${activeFile}.gcfg`}
                                onClose={closeEditor}
                            />
                        </Suspense>
                    ) : (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: V.text2, flexDirection: 'column', gap: 12,
                            height: '100%',
                        }}>
                            <span style={{fontSize: 48}}>📋</span>
                            <span>{t('从左侧选择一个配置表文件进行编辑')}</span>
                        </div>
                    )}
                </div>
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
