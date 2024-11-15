import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {InputText} from "../../../meta/component/Input";
import {fileHttp} from "../../util/config";
import {getRouterAfter} from "../../util/WebPath";
import {useLocation, useNavigate} from "react-router-dom";
import {getFilesByIndexs} from "../file/FileUtil";
import {useTranslation} from "react-i18next";
import {CardPrompt} from "../../../meta/component/Card";

export function FileRename(props) {
    const {t} = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectedFile, setSelectedFile] = useRecoilState($stroe.selectedFileList);
    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    const [name, setName] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const cancel = () => {
        setShowPrompt({show: false, type: "", overlay: false, data: {}})
    }
    const getName = () => {
        if (!showPrompt.data.path) {
            const files = getFilesByIndexs(nowFileList, selectedFile);
            return files[0].name;
        } else {
            return showPrompt.data.filename;
        }

    }
    const dirnew = async () => {
        if (!showPrompt.data.path && (!name || selectedFile.length !== 1)) {
            cancel()
            return;
        }
        let newName;
        let filename;
        if (!showPrompt.data.path) {
            const files = getFilesByIndexs(nowFileList, selectedFile);
            newName = `${getRouterAfter('file', location.pathname)}${name}`
            filename = `${getRouterAfter('file', location.pathname)}${files[0].name}`
        } else {
            filename = showPrompt.data.path;
            newName = `${showPrompt.data.dir}${name}`;
        }
        const rsq = await fileHttp.post('rename', {name: filename, newName: newName})
        if (rsq.code === 0) {
            cancel();
            if (showPrompt.data.call) {
                showPrompt.data.call();
            } else {
                navigate(location.pathname);
            }
        }
    }


    return (<CardPrompt title={t("修改名字")} cancel={cancel} confirm={dirnew} cancel_t={t("取消")}
                        confirm_t={t("修改")}
                        context={[
                            <div className="card-content">
                                <InputText placeholderOut={t("输入新名字")} value={getName()}
                                           handleInputChange={(value) => setName(value)}/>

                            </div>]}
                        confirm_enter={dirnew}
    />)
}
