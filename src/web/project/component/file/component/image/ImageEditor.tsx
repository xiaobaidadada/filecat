import React, {useEffect} from "react";
import { useAtom } from 'jotai'; 
import {$stroe} from "../../../../util/store";
import {getRouterAfter, getRouterPath, getRouterPrePath} from "../../../../util/WebPath";
import {fileHttp} from "../../../../util/config";
import {loadJsFileOnce} from "../../../../util/file";
import {NotyFail, NotySuccess} from "../../../../util/noty";
import {RCode} from "../../../../../../common/Result.pojo";
import {useLocation, useNavigate} from "react-router-dom";
import {use_editor_auto_save} from "../../../../util/editor_auto_save";
import {EditorAutoSaveEnum} from "../../../../../../common/req/user.req";

let loadfile_done = false;
let filerobotImageEditor;

export default function ImageEditor() {
    const [image_editor, set_image_editor] = useAtom($stroe.image_editor);
    const navigate = useNavigate();
    const location = useLocation();
    // 图片被修改标记（自动保存用；保存成功后清除）
    const dirty_ref = React.useRef(false);

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
                dirty_ref.current = false;
                NotySuccess('保存成功')
            },
            // 图像被修改（自动保存的 dirty 标记）
            onModify: () => {
                dirty_ref.current = true;
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

    // 编辑器自动保存（个人设置里可配置）。
    // filerobot 没有编程式保存 API，只能通过点击它的「保存(Save)」按钮触发 onSave，
    // 这里在定时器到点时模拟点击该按钮。
    use_editor_auto_save(EditorAutoSaveEnum.image, () => dirty_ref.current, () => {
        const btn = Array.from(document.querySelectorAll('#editor_container button'))
            .find(b => (b.textContent || '').includes('Save') || (b.textContent || '').includes('保存')) as HTMLButtonElement | undefined;
        btn?.click();
    });

    return <div id={"image-editor-container"}>
        <div className={"image-editor-context"}>
            <div id={"editor_container"} className={"image-editor-context"} />
        </div>
    </div>
}