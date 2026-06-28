import React, {Suspense, useEffect, useState} from 'react';
import {useAtom} from 'jotai';
import {$stroe} from "../../../../util/store";
import {useTranslation} from "react-i18next";

const GcfgEditor = React.lazy(() => import('./GcfgEditor'));
const GcfgDirConfig = React.lazy(() => import('./GcfgDirConfig'));

export default function GcfgEntry() {
    const [gcfgEditor, setGcfgEditor] = useAtom($stroe.gcfg_editor);
    const [gcfgDirConfig, setGcfgDirConfig] = useAtom($stroe.gcfg_dir_config);
    const [editingFile, setEditingFile] = useState<string | null>(null);

    // 从目录配置中打开文件
    const handleOpenFile = (fileName: string) => {
        setGcfgEditor({
            open: true,
            path: `${gcfgDirConfig.dir}/${fileName}.gcfg`,
            name: `${fileName}.gcfg`,
        });
    };

    // 右键文件打开编辑器（全局 GcfgEditor 弹窗）
    if (gcfgEditor.open) {
        return (
            <Suspense fallback={<div></div>}>
                <GcfgEditor/>
            </Suspense>
        );
    }

    // 右键目录打开配置面板
    if (gcfgDirConfig.open) {
        return (
            <Suspense fallback={<div></div>}>
                <GcfgDirConfig
                    dir={gcfgDirConfig.dir!}
                    onOpenFile={handleOpenFile}
                    onClose={() => setGcfgDirConfig({open: false})}
                />
            </Suspense>
        );
    }

    return null;
}
