import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {InputText} from "../../../../meta/component/Input";
import {fileHttp, sshHttp} from "../../../util/config";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {useLocation, useNavigate} from "react-router-dom";
import {SshPojo} from "../../../../../common/req/ssh.pojo";
import {joinPaths} from "../../../../../common/ListUtil";
import {useTranslation} from "react-i18next";
import {CardPrompt} from "../../../../meta/component/Card";

export function SshNewDir(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [sshInfo,setSSHInfo] = useRecoilState<any>($stroe.sshInfo);
    const [shellNowDir, setShellNowDir] = useRecoilState($stroe.shellNowDir);

    const [name, setName] = useState("");
    const navigate = useNavigate();

    const cancel=()=> {
        setShowPrompt({show: false,type: "",overlay: false,data:{ok:true}})
    }
    const dirnew = async ()=>{
        if (!name) {
            cancel()
            return;
        }
        const req = new SshPojo();
        req.key = sshInfo.key;
        req.dir = `/${getRouterAfter('remoteShell', getRouterPath())}${name}`
        // Object.assign(req,sshInfo);
        // req.dir = joinPaths(...shellNowDir,name);
        req.file = null;
        const rsq = await sshHttp.post('create', req)
        if (rsq.code === 0) {
            cancel();
            navigate(getRouterPath());
        }
    }

    return (<CardPrompt title={t("创建目录")} cancel={cancel} confirm={dirnew} cancel_t={t("取消")} confirm_t={t("创建")}
                        context={[
                            <div className="card-content">
                                <InputText placeholderOut={t("输入目录名")} value={name}
                                           handleInputChange={(value) => setName(value)}/>
                            </div>]}
                        confirm_enter={dirnew}
    />)
}
