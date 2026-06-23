import React, {useEffect, useState} from 'react';
import { useAtom } from 'jotai'; 
import {$stroe} from "../../util/store";
import {InputText} from "../../../meta/component/Input";
import {navHttp} from "../../util/config";
import {useLocation, useNavigate} from "react-router-dom";
import {RCode} from "../../../../common/Result.pojo";
import {useTranslation} from "react-i18next";
import {getRouterPath} from "../../util/WebPath";
import {NotyFail} from "../../util/noty";


export function NavIndexAdd(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);
    const [name, setName] = useState("");
    const [url,setUrl] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const cancel=()=> {
        setShowPrompt({show: false,type: "",overlay: false,data:{}})
    }
    const add = async () =>{
        if (!name && !url) {
            NotyFail('都不能为空')
        }
        const result = await navHttp.post("add",{name,url});
        if (result.code === RCode.Success) {
            cancel();
            // 需要当前页面监听    const location = useLocation();
            navigate(getRouterPath());
        }
    }
    return (<div className={"card floating"}>
        <div className="card-title">
            <h2>{t("添加网站")}</h2>
        </div>
        <div className="card-content">
            <InputText placeholderOut={"名字"}  handleInputChange={(value)=>setName(value)} />
            <InputText placeholderOut={"url"}  handleInputChange={(value)=>setUrl(value)} handlerEnter={add} />
        </div>
        <div className="card-action">
            <button className="button button--flat button--grey" onClick={cancel}>
                {t("取消")}
            </button>
            <button className="button button--flat" onClick={add}>
                {t("添加")}
            </button>
        </div>
    </div>)
}
