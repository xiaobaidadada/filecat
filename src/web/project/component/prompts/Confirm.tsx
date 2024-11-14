import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {useLocation, useNavigate} from "react-router-dom";
import {useTranslation} from "react-i18next";

// 通用确认
export function Confirm(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.confirm);
    // const navigate = useNavigate();
    // const location = useLocation();

    const cancel=()=> {
        setShowPrompt({open: false,handle:null})
    }
    const del = async ()=>{
        await showPrompt.handle();
        // 会自己刷新
        // navigate(location.pathname);
    }
    return (<div className={"card floating"}>
        <div className="card-title">
            <h2>{showPrompt.title ?? t("验证执行")}</h2>
        </div>
        <div>
            {showPrompt.sub_title}
        </div>
        <div className="card-action">
            <button className="button button--flat button--grey" onClick={cancel}>
                {t("取消")}
            </button>
            <button className="button button--flat" onClick={del}>
                {t("确定")}
            </button>
        </div>
    </div>)
}
