import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {InputText} from "../../../meta/component/Input";
import {navHttp} from "../../util/config";;
import {useLocation, useNavigate} from "react-router-dom";
import Noty from "noty";
import {RCode} from "../../../../common/Result.pojo";
import {useTranslation} from "react-i18next";


export function NavIndexAdd(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [name, setName] = useState("");
    const [url,setUrl] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const cancel=()=> {
        setShowPrompt({show: false,type: "",overlay: false,data:{}})
    }
    const add = async () =>{
        if (!name && !url) {
            new Noty({
                type: 'error',
                text: '都不能为空',
                timeout: 1000, // 设置通知消失的时间（单位：毫秒）
                layout:"bottomLeft"
            }).show();
        }
        const result = await navHttp.post("add",{name,url});
        if (result.code === RCode.Sucess) {
            cancel();
            // 需要当前页面监听    const location = useLocation();
            navigate(location.pathname);
            // new Noty({
            //     type: 'success',
            //     text: '成功',
            //     timeout: 1000, // 设置通知消失的时间（单位：毫秒）
            //     layout:"bottomLeft"
            // }).show();
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
