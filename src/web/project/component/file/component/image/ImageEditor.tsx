import React, {useEffect} from "react";
import { useAtom } from 'jotai'; 
import {$stroe} from "../../../../util/store";
import {getRouterAfter, getRouterPath, getRouterPrePath} from "../../../../util/WebPath";
import {fileHttp} from "../../../../util/config";
import {loadJsFileOnce} from "../../../../util/file";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {RCode} from "../../../../../../common/Result.pojo";
import {useLocation, useNavigate} from "react-router-dom";

let loadfile_done = false;
let filerobotImageEditor;

export default function ImageEditor() {
    const [image_editor, set_image_editor] = useAtom($stroe.image_editor);
    const navigate = useNavigate();
    const location = useLocation();

    const loadFile = async ()=>{
        if (!loadfile_done) {
            try {
                await loadJsFileOnce("filerobot-image-editor.min.js");
                loadfile_done = true;
            } catch (error) {
                NotyFail("加载资源失败");
                return;
            }
        }
        const path = getRouterAfter('file',image_editor.path);
        // @ts-ignore
        const FilerobotImageEditor = window.FilerobotImageEditor;
        const { TABS, TOOLS } = FilerobotImageEditor;
        const config = {
            defaultSavedImageName: image_editor.name,
            source: fileHttp.getDownloadUrl(path),
            onSave: async (editedImageObject, designState) =>
            {
                const extension = editedImageObject.extension;
                const name = editedImageObject.name ?? image_editor.name;
                // 二进制直传：PUT /file/:path 内部直接流过 req 流写盘，
                // 不再走 base64（体积放大 33%）与分片拼接。
                const blob = await new Promise<Blob>(resolve =>
                    editedImageObject.imageCanvas.toBlob(resolve, editedImageObject.mimeType));
                await fileHttp.put(`${encodeURIComponent(`${getRouterPrePath(path)}${name}.${extension}`)}`, blob, undefined);
                NotySuccess('保存成功')
            },
            annotationsCommon: {
                fill: '#151717', // text颜色
                stroke: '#ec0f42',
                shadowColor: '#151717',
            },
            Text: { text: '' },
            Rotate: { angle: 90, componentType: 'slider' },
            tabsIds: [Object.values(TABS)], // or ['Adjust', 'Annotate', 'Watermark']
            defaultTabId: TABS.ANNOTATE, // or 'Annotate'
            defaultToolId: TOOLS.ANNOTATE, // or 'Text'
        };

        // Assuming we have a div with id="editor_container"
        filerobotImageEditor = new FilerobotImageEditor(
            document.querySelector('#editor_container'),
            config,
        );

        filerobotImageEditor.render({
            onClose: (closingReason) => {
                filerobotImageEditor.terminate();
                const close_cb = image_editor.close;
                set_image_editor({});
                close_cb?.();
                navigate(getRouterPath());
            },
        });
    }

    useEffect(() => {
        loadFile();

        return ()=>{
            if (filerobotImageEditor) {
                filerobotImageEditor.terminate();
            }
        }
    }, []);

    return <div id={"image-editor-container"}>
        <div className={"image-editor-context"}>
            <div id={"editor_container"} className={"image-editor-context"} />
        </div>
    </div>
}