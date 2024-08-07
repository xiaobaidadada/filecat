import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {ws} from "../../util/ws";
import {useLocation, useNavigate} from "react-router-dom";
import {useTranslation} from "react-i18next";


export function DockerDel(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    // const navigate = useNavigate();
    // const location = useLocation();

    const cancel=()=> {
        setShowPrompt({show: false,type: "",overlay: false,data:{}})
    }
    const del = async ()=>{
        const data = new WsData(CmdType.docker_del_container);
        data.context = {dockerId:showPrompt.data.dockerId}
        await ws.send(data);
        cancel();
        // 会自己刷新
        // navigate(location.pathname);
    }
    return (<div className={"card floating"}>
        <div className="card-title">
            <h2>{t("确定删除")}</h2>
        </div>
        <div className="card-content">
            {t("是否删除")}:{showPrompt.data.name}
        </div>

        <div className="card-action">
            <button className="button button--flat button--grey" onClick={cancel}>
                {t("取消")}
            </button>
            <button className="button button--flat" onClick={del}>
                {t("删除")}
            </button>
        </div>
    </div>)
}
