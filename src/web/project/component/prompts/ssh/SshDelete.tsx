import React, {useEffect} from 'react';

import {useLocation, useMatch, useNavigate} from "react-router-dom";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {fileHttp, sshHttp} from "../../../util/config";
import {fileReq} from "../../../../../common/req/file.req";
import {getByIndexs, joinPaths} from "../../../../../common/ListUtil";
import {getRouterAfter} from "../../../util/WebPath";
import {getFileNameByLocation, getFilesByIndexs} from "../../file/FileUtil";
import {SshPojo} from "../../../../../common/req/ssh.pojo";
import {FileTypeEnum} from "../../../../../common/file.pojo";


export function SshDelete(props) {

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectedFileList,setSelectedFileList] = useRecoilState($stroe.selectedFileList);
    const [nowFileList,setNowFileList] = useRecoilState($stroe.nowFileList);
    const [sshInfo,setSSHInfo] = useRecoilState($stroe.sshInfo);
    const [shellNowDir, setShellNowDir] = useRecoilState($stroe.shellNowDir);

    function cancel(){
        setShowPrompt({
            show:false,overlay: false,type: '',data: {}
        })
    }
    async function confirm() {

        const files = getFilesByIndexs(nowFileList, selectedFileList);
        for (const file of files) {
            const req = new SshPojo();
            Object.assign(req,sshInfo);
            if (FileTypeEnum.folder === file['type']) {
                req.dir = joinPaths(...shellNowDir,file.name);
                req.file = null;
            } else {
                req.file = joinPaths(...shellNowDir,file.name);
                req.dir = null;
            }
            await sshHttp.post('delete', req)
        }
        setShowPrompt({
            show:false,overlay: false,type: '',data: {ok:true}
        })
        setSelectedFileList([])
    }

    return (
        <div className="card floating">
            <div className="card-content">
                <p>
                    是否删除选中的文件
                </p>

            </div>
            <div className="card-action">
                <button
                    className="button button--flat button--grey" onClick={cancel}
                >
                    取消
                </button>
                <button
                    className="button button--flat button--red" onClick={confirm}
                >
                    删除
                </button>
            </div>
        </div>
    )
}
