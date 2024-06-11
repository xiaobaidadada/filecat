import React, {useEffect} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {fileHttp, sshHttp} from "../../../util/config";
import {getRouterAfter} from "../../../util/WebPath";
import {useNavigate} from "react-router-dom";
import {joinPaths} from "../../../../../common/ListUtil";
import {SshPojo} from "../../../../../common/req/ssh.pojo";

export function SshPaste(props) {
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [copyedFileList,setCopyedFileList] = useRecoilState($stroe.copyedFileList);
    const [cutedFileList,setCutedFileList] = useRecoilState($stroe.cutedFileList);
    const [sshInfo,setSSHInfo] = useRecoilState($stroe.sshInfo);
    const [shellNowDir, setShellNowDir] = useRecoilState($stroe.shellNowDir);

    function cancel(){
        setShowPrompt({
            show:false,overlay: false,type: '',data:{ok:true}
        })
        if (cutedFileList.length > 0) {
            setCutedFileList([])
        } else {
            setCopyedFileList([])
        }
    }
    async function ok() {
        const req = new SshPojo();
        Object.assign(req,sshInfo);
        req.target = joinPaths(...shellNowDir);
        if (cutedFileList.length > 0) {
            for (const file of cutedFileList) {
                req.source = file;
                await sshHttp.post('move',req);
            }
            setCutedFileList([])
        } else {
            for (const file of copyedFileList) {
                req.source = file;
                await sshHttp.post('copy',req);
            }
            setCopyedFileList([])
        }
        cancel();
    }
    return <div className="card floating">
        <div className="card-content">
            <p>
                {cutedFileList.length>0?"剪切(覆盖)确认":"复制(覆盖)确认"}
            </p>
        </div>
        <div className="card-action">
            <button
                className="button button--flat button--grey" onClick={cancel}
            >
                取消
            </button>
            <button
                className="button button--flat button--red" onClick={ok}
            >
                确认
            </button>
        </div>
    </div>
}
