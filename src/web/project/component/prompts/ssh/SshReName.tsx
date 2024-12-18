import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {InputText} from "../../../../meta/component/Input";
import { sshHttp} from "../../../util/config";
import {getFilesByIndexs} from "../../file/FileUtil";
import {SshPojo} from "../../../../../common/req/ssh.pojo";
import {joinPaths} from "../../../../../common/ListUtil";
import {useTranslation} from "react-i18next";
import {CardPrompt} from "../../../../meta/component/Card";

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

    return (<CardPrompt title={t("修改名字")} cancel={cancel} confirm={dirnew} cancel_t={t("取消")} confirm_t={t("创建")}
                        context={[
                            <div className="card-content">
                                <InputText placeholderOut={t("输入新名字")} value={name}
                                           handleInputChange={(value) => setName(value)}/>
                            </div>]}
                        confirm_enter={dirnew}
    />)
}
