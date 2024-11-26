import React, {useEffect} from 'react';
import {ActionButton} from "../../../meta/component/Button";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {useLocation, useMatch, useNavigate} from "react-router-dom";
import {fileHttp} from "../../util/config";
import {getNewDeleteByList} from "../../../../common/ListUtil";
import {getRouterAfter} from "../../util/WebPath";
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
                    const rsp = await fileHttp.put(`${getRouterAfter('file',location.pathname)}${value.fullPath}`, value, (progressEvent) => {
                        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                        setNowProgress({
                            name: value.name,
                            value: percentCompleted,
                            index: index
                        })
                    })
                    if (rsp.code === 0) {
                        // @ts-ignore
                        // setUploadFiles(getNewDeleteByList(newList, value))
                    }
                    if (index === newList.length - 1) {
                        navigate(location.pathname);
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
                <ActionButton icon={open ? "keyboard_arrow_down" : "keyboard_arrow_up"} title={"Toggle file upload list"} onClick={click}/>
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
