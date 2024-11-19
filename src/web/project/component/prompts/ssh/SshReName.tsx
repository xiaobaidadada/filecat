import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {InputText} from "../../../../meta/component/Input";
import { sshHttp} from "../../../util/config";
import {getFilesByIndexs} from "../../file/FileUtil";
import {SshPojo} from "../../../../../common/req/ssh.pojo";
import {joinPaths} from "../../../../../common/ListUtil";
import {useTranslation} from "react-i18next";

export function SshReName(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectedFile, setSelectedFile] = useRecoilState($stroe.selectedFileList);
    const [nowFileList,setNowFileList] = useRecoilState($stroe.nowFileList);
    const [name, setName] = useState("");
    const [sshInfo,setSSHInfo] = useRecoilState($stroe.sshInfo);
    const [shellNowDir, setShellNowDir] = useRecoilState($stroe.shellNowDir);

    const cancel=()=> {
        setSelectedFile([]);
        setShowPrompt({show: false,type: "",overlay: false,data:{ok:true}})
    }
    const getName = () =>{
        const files = getFilesByIndexs(nowFileList, selectedFile);
        return files[0].name;
    }
    const dirnew = async ()=>{
        if (!name || selectedFile.length!==1) {
            cancel()
            return;
        }
        const req = new SshPojo();
        Object.assign(req,sshInfo);
        const files = getFilesByIndexs(nowFileList, selectedFile);
        req.target = joinPaths(...shellNowDir,name);
        req.source = joinPaths(...shellNowDir,files[0].name);
        const rsq = await sshHttp.post('move', req);
        if (rsq.code === 0) {
            cancel();
        }
    }
    return (<div className={"card floating"}>
        <div className="card-title">
            <h2>{t("修改名字")}</h2>
        </div>
        <div className="card-content">
            <InputText placeholderOut={t("输入新名字")} value={getName()} handleInputChange={(value)=>setName(value)} />
        </div>
        <div className="card-action">
            <button className="button button--flat button--grey" onClick={cancel}>
                {t("取消")}
            </button>
            <button className="button button--flat" onClick={dirnew}>
                {t("revise")}
            </button>
        </div>
    </div>)
}
