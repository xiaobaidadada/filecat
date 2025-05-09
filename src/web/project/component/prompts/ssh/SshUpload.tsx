import React, {useEffect} from 'react';
import {ActionButton} from "../../../../meta/component/Button";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {useLocation, useMatch, useNavigate} from "react-router-dom";
import {fileHttp, sshHttp} from "../../../util/config";
import {getNewDeleteByList, joinPaths} from "../../../../../common/ListUtil";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {useTranslation} from "react-i18next";


export function SshUpload() {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [open, setOpen] = React.useState(false);
    const [uploadFiles, setUploadFiles] = useRecoilState($stroe.uploadFiles);
    const [nowProgress, setNowProgress] = useRecoilState($stroe.nowProgress);

    const [sshInfo,setSSHInfo] = useRecoilState($stroe.sshInfo);
    const [shellNowDir, setShellNowDir] = useRecoilState($stroe.shellNowDir);
    const navigate = useNavigate();
    function click() {
        setOpen(!open);
    }
    useEffect(() => {
        (async () => {
            const newList: any = Array.from(uploadFiles);
            for (let index = 0; index < newList.length; ) {
                let value: any = newList[index];
                const target = `/${getRouterAfter('remoteShell', getRouterPath())}${decodeURIComponent(value.fullPath)}`
                const url = `?target=${target}&key=${sshInfo['key']}&dir=${value.isDir?1:0}`;
                // const url = `?target=${encodeURIComponent(joinPaths(...shellNowDir,value.fullPath))}&domain=${sshInfo['domain']}&port=${sshInfo['port']}&username=${sshInfo['username']}&password=${sshInfo['password']}&dir=${value.isDir?1:0}`;
                const rsp = await sshHttp.put(url, value, (progressEvent) => {
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
                    setUploadFiles([])
                    setShowPrompt({show: false,type: '',overlay: false,data:{ok:true}})
                }
                index++;
            }
            navigate(getRouterPath());
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
                            {/*展示多个文件*/}
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
