import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {InputText, Select} from "../../../meta/component/Input";
import {fileHttp} from "../../util/config";
import {getRouterAfter} from "../../util/WebPath";
import {useLocation, useNavigate} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {FileCompressType} from "../../../../common/file.pojo";
import {CardPrompt, ProgressCard} from "../../../meta/component/Card";

export function DirNew(props) {
    const {t} = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [name, setName] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const cancel = () => {
        setShowPrompt({show: false, type: "", overlay: false, data: {}})
    }
    const dirnew = async () => {
        if (!name) {
            cancel()
            return;
        }
        // 新建文件和新建文件夹的名字都不能含有 / 这样的特殊路径
        const fileName = `${showPrompt.data.dir}${name}`
        const rsq = await fileHttp.post('new/dir', {name: fileName})
        if (rsq.code === 0) {
            cancel();
            if (showPrompt.data.call) {
                showPrompt.data.call();
            } else {
                navigate(location.pathname);
            }
        }
    }

    return (<CardPrompt title={t("创建目录")} cancel={cancel} confirm={dirnew} cancel_t={t("取消")}
                        confirm_t={t("创建")}
                        context={[
                            <div className="card-content">
                                <InputText placeholderOut={t("输入目录名")} value={name}
                                           handleInputChange={(value) => setName(value)}/>
                            </div>]}
            confirm_enter={dirnew}
    />)
}
