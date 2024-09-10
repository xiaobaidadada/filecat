import React, {useEffect} from "react";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../../util/store";
import {getRouterAfter, getRouterPrePath} from "../../../../util/WebPath";
import {fileHttp} from "../../../../util/config";
import {loadJsFileOnce} from "../../../../util/file";
import {NotyFail, NotySucess} from "../../../../util/noty";
import {RCode} from "../../../../../../common/Result.pojo";
import {base64UploadType} from "../../../../../../common/file.pojo";
import {createChunks} from "../../../../util/store.util";
import {useLocation, useNavigate} from "react-router-dom";

let loadfile_done = false;
let filerobotImageEditor;
// 不一定是1 Mb
const max_length = 1024 * 1000 ;

export function ImageEditor() {
    const [image_editor, set_image_editor] = useRecoilState($stroe.image_editor);
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
                const base64Data  = editedImageObject.imageBase64.split(',')[1]; // 提取 Base64 编码部分
                const mimeType = editedImageObject.mimeType;
                const extension = editedImageObject.extension;
                const name = editedImageObject.name ?? image_editor.name;
                const router_path = `base64/save/${encodeURIComponent(`${getRouterPrePath(path)}/${name}.${extension}`)}`;
                if (base64Data.length <= max_length) {
                    const data = {
                        base64_context:base64Data,
                        type:base64UploadType.all
                    }
                    await fileHttp.post(router_path, data);
                } else {
                    // // 创建分片
                    const chunks = createChunks(base64Data, max_length);
                    const data = {
                        base64_context:chunks[0],
                        type:base64UploadType.start
                    }
                    data.type = base64UploadType.part;
                    await fileHttp.post(router_path+`?type${base64UploadType.start}`, data);
                    for (let i=1; i< chunks.length; i++) {
                        data.base64_context = chunks[i];
                        await fileHttp.post(router_path, data);
                    }

                }
                NotySucess('保存成功')

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
                set_image_editor({});
                navigate(location.pathname);
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