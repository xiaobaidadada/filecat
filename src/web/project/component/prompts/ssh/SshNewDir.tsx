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

export function SshNewDir(props) {
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
        req.dir = joinPaths(...shellNowDir,name);
        req.file = null;
        const rsq = await sshHttp.post('create', req)
        if (rsq.code === 0) {
            cancel();
        }
    }
    return (<div className={"card floating"}>
        <div className="card-title">
            <h2>{t("创建目录")}</h2>
        </div>
        <div className="card-content">
            <InputText placeholderOut={t("输入目录名")} value={name} handleInputChange={(value)=>setName(value)} />
        </div>
        <div className="card-action">
            <button className="button button--flat button--grey" onClick={cancel}>
                {t("取消")}
            </button>
            <button className="button button--flat" onClick={dirnew}>
                {t("创建")}
            </button>
        </div>
    </div>)
}
