import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {InputText} from "../../../meta/component/Input";
import {fileHttp} from "../../util/config";
import {getRouterAfter} from "../../util/WebPath";
import {useLocation, useNavigate} from "react-router-dom";
import {useTranslation} from "react-i18next";

export function FileNew(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [name, setName] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const cancel=()=> {
        setShowPrompt({show: false,type: "",overlay: false,data:{}})
    }
    const dirnew = async ()=>{
        if (!name) {
            cancel()
            return;
        }
        const fileName = `${getRouterAfter('file',location.pathname)}${name}`
        const rsq = await fileHttp.post('new/file', {name:fileName})
        if (rsq.code === 0) {
            cancel();
            navigate(location.pathname);
        }
    }
    return (<div className={"card floating"}>
        <div className="card-title">
            <h2>{t("创建文件")}</h2>
        </div>
        <div className="card-content">
            <InputText placeholderOut={t("输入文本名")} value={name} handleInputChange={(value)=>setName(value)} />
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
