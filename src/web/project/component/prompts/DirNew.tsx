import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {InputText} from "../../../meta/component/Input";
import {fileHttp} from "../../util/config";
import {getRouterAfter} from "../../util/WebPath";
import {useLocation, useNavigate} from "react-router-dom";
import {useTranslation} from "react-i18next";

export function DirNew(props) {
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
        // 新建文件和新建文件夹的名字都不能含有 / 这样的特殊路径
        const fileName = `${showPrompt.data.dir}${name}`
        const rsq = await fileHttp.post('new/dir', {name:fileName})
        if (rsq.code === 0) {
            cancel();
            if (showPrompt.data.call) {
                showPrompt.data.call();
            } else {
                navigate(location.pathname);
            }
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
