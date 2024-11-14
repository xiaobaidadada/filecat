import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {InputText, Select} from "../../../meta/component/Input";
import {fileHttp} from "../../util/config";
import {getRouterAfter} from "../../util/WebPath";
import {useLocation, useNavigate} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {FileCompressType} from "../../../../common/file.pojo";
import {CardPrompt} from "../../../meta/component/Card";

export function FileNew(props) {
    const { t } = useTranslation();
    const [format, setFormat] = useState("");

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [name, setName] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const select_item = [{title:`${t("空")}`,value:""},{title:`excalidraw${t("格式")}`,value:".excalidraw"}]
    const cancel=()=> {
        setShowPrompt({show: false,type: "",overlay: false,data:{}})
    }
    const dirnew = async ()=>{
        if (!name) {
            cancel()
            return;
        }
        let r_name = name;
        let context = "";
        if (format) {
            if (!name.endsWith(format)) {
                r_name = name+format;
            }
            if (format === ".excalidraw") {
                context = "{}";
            }
        }
        const fileName = `${showPrompt.data.dir}${r_name}`
        const rsq = await fileHttp.post('new/file', {name:fileName,context})
        if (rsq.code === 0) {
            cancel();
            if (showPrompt.data.call) {
                showPrompt.data.call();
            } else {
                navigate(location.pathname);
            }
        }
    }

    return (<CardPrompt title={t("创建文件")} cancel={cancel} confirm={dirnew} cancel_t={t("取消")}
                        confirm_t={t("创建")}
                        context={[
                            <div className="card-content">
                                <InputText placeholderOut={t("输入文件名")} value={name}
                                           handleInputChange={(value) => setName(value)}/>
                            </div>]}
                        confirm_enter={dirnew}
    />)
}
