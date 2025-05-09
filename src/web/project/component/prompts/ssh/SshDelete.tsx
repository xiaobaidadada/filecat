import React, {useEffect} from 'react';

import {useLocation, useMatch, useNavigate} from "react-router-dom";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {fileHttp, sshHttp} from "../../../util/config";
import {fileReq} from "../../../../../common/req/file.req";
import {getByIndexs, joinPaths} from "../../../../../common/ListUtil";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {getFileNameByLocation, getFilesByIndexs} from "../../file/FileUtil";
import {SshPojo} from "../../../../../common/req/ssh.pojo";
import {FileTypeEnum} from "../../../../../common/file.pojo";
import {useTranslation} from "react-i18next";


export function SshDelete(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectedFileList,setSelectedFileList] = useRecoilState($stroe.selectedFileList);
    const [nowFileList,setNowFileList] = useRecoilState($stroe.nowFileList);
    const [sshInfo,setSSHInfo] = useRecoilState<any>($stroe.sshInfo);
    const [shellNowDir, setShellNowDir] = useRecoilState($stroe.shellNowDir);
    const navigate = useNavigate();

    function cancel(){
        setShowPrompt({
            show:false,overlay: false,type: '',data: {}
        })
    }
    async function confirm() {

        const files = getFilesByIndexs(nowFileList, selectedFileList);
        for (const file of files) {
            const req = new SshPojo();
            // Object.assign(req,sshInfo);
            req.key = sshInfo.key;

            if (FileTypeEnum.folder === file['type']) {
                req.dir = `/${getRouterAfter('remoteShell', getRouterPath())}${file.name}`
                // req.dir = joinPaths(...shellNowDir,file.name);
                req.file = null;
            } else {
                req.file = `/${getRouterAfter('remoteShell', getRouterPath())}${file.name}`
                // req.file = joinPaths(...shellNowDir,file.name);
                req.dir = null;
            }
            await sshHttp.post('delete', req)
        }
        setShowPrompt({
            show:false,overlay: false,type: '',data: {ok:true}
        })
        setSelectedFileList([])
        navigate(getRouterPath());
    }

    return (
        <div className="card floating">
            <div className="card-content">
                <p>
                    {t("是否删除选中的文件")}
                </p>

            </div>
            <div className="card-action">
                <button
                    className="button button--flat button--grey" onClick={cancel}
                >
                    {t("取消")}
                </button>
                <button
                    className="button button--flat button--red" onClick={confirm}
                >
                    {t("删除")}
                </button>
            </div>
        </div>
    )
}
