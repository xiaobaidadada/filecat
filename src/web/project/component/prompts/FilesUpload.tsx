import React, {useEffect, useRef, useState} from 'react';
import {ActionButton} from "../../../meta/component/Button";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {useLocation, useMatch, useNavigate} from "react-router-dom";
import {fileHttp} from "../../util/config";
import {getNewDeleteByList} from "../../../../common/ListUtil";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {useTranslation} from "react-i18next";
import {NotyFail} from "../../util/noty";

export function FilesUpload() {
    const { t } = useTranslation();

    let location = useLocation();
    const navigate = useNavigate();


    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [open, setOpen] = React.useState(false);
    const [uploadFiles, setUploadFiles] = useRecoilState($stroe.uploadFiles);
    const [nowProgress, setNowProgress] = useRecoilState($stroe.nowProgress);
    const [speed, setSpeed] = useState(0); // 上传速度 MB/s
    const timeoutRef = useRef<NodeJS.Timeout | null>(null); // 用于存储 `setTimeout` 渲染期间内保持 且不会被渲染

    function click() {
        setOpen(!open);
    }


    useEffect(() => {
        (async () => {
            const newList: any = Array.from(uploadFiles);
            for (let index = 0; index < newList.length; ) {
                let value: any = newList[index];
                try {
                    // console.log(`${getRouterAfter('file',location.pathname)}${value.fullPath}`)
                    const startTime = Date.now();
                    const rsp = await fileHttp.put(`${encodeURIComponent(`${getRouterAfter('file',getRouterPath())}${value.fullPath}`)}?dir=${value.isDir?1:0}`, value, (progressEvent) => {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        setNowProgress({
                            name: value.name,
                            value: percentCompleted,
                            index: index
                        })
                        const elapsedTime = (Date.now() - startTime) / 1000; // seconds

                        // 计算上传速度（MB/s）
                        if (elapsedTime > 0) {
                            const uploadSpeed = (progressEvent.loaded / (1024 * 1024) / elapsedTime).toFixed(2);
                            setSpeed(parseFloat(uploadSpeed));
                        }

                        // **清除旧的 `setTimeout` 并重置**
                        if (timeoutRef.current) clearTimeout(timeoutRef.current);
                        // **如果 1 秒后没有新的 `onUploadProgress` 触发，则设为 0**
                        timeoutRef.current = setTimeout(() => {
                            setSpeed(0);
                        }, 1000);
                    })
                    if (rsp.code === 0) {
                        // @ts-ignore
                        // setUploadFiles(getNewDeleteByList(newList, value))
                    }
                    if (index === newList.length - 1) {
                        navigate(getRouterPath());
                        setUploadFiles([])
                        setShowPrompt({show: false,type: '',overlay: false,data:{}})
                    }
                    index++;
                } catch (e) {
                    NotyFail(`上传:${value.name} 文件出错!`)
                    return;
                }

            }
            // console.log(uploadFiles)
        })();
    }, []);
    // @ts-ignore
    return <div
        className="upload-files"
    >
        <div className="card floating">
            <div className="card-title">
                <h2>{uploadFiles.length}{t("个文件正在上传")}</h2>
                <ActionButton icon={open ? "keyboard_arrow_down" : "keyboard_arrow_up"}
                              title={"Toggle file upload list"} onClick={click}/>
                <div className="upload-speed">{speed} MB/s</div>
            </div>
            {open && <div className="card-content file-icons">
            {
                    uploadFiles.map((v: any, index) => (
                        <div className="file" key={index}>
                            <div className="file-name">
                                {/*<i className="material-icons"></i>*/}
                                {v.name}
                            </div>
                            <div className="file-progress">
                                <div style={{
                                    "width": `${
                                        nowProgress.index>index?100:
                                        nowProgress.name === v.name ? nowProgress.value : 1}%`
                                }}></div>
                            </div>
                        </div>))
                }
            </div>}
        </div>
    </div>
}
