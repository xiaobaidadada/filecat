import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {InputText} from "../../../../meta/component/Input";
import {fileHttp, sshHttp} from "../../../util/config";
import {getRouterAfter} from "../../../util/WebPath";
import {useLocation, useNavigate} from "react-router-dom";
import {SshPojo} from "../../../../../common/req/ssh.pojo";
import {joinPaths} from "../../../../../common/ListUtil";
import {useTranslation} from "react-i18next";
import {CardPrompt} from "../../../../meta/component/Card";

export function SshNewFile(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [sshInfo,setSSHInfo] = useRecoilState($stroe.sshInfo);
    const [shellNowDir, setShellNowDir] = useRecoilState($stroe.shellNowDir);

    const [name, setName] = useState("");

    const cancel=()=> {
        setShowPrompt({show: false,type: "",overlay: false,data:{ok:true}})
    }
    const dirnew = async ()=>{
        if (!name) {
            cancel()
            return;
        }
        const req = new SshPojo();
        Object.assign(req,sshInfo);
        req.dir = null;
        req.file = joinPaths(...shellNowDir,name);
        const rsq = await sshHttp.post('create', req)
        if (rsq.code === 0) {
            cancel();
        }
    }

    return (<CardPrompt title={t("创建文件")} cancel={cancel} confirm={dirnew} cancel_t={t("取消")} confirm_t={t("创建")}
                        context={[
                            <div className="card-content">
                                <InputText placeholderOut={t("输入文本名")} value={name}
                                           handleInputChange={(value) => setName(value)}/>
                            </div>]}
                        confirm_enter={dirnew}
    />)
}
