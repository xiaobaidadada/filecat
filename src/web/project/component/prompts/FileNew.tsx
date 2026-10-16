import React, {useEffect, useState} from 'react';
import { useAtom } from 'jotai';
import {$stroe} from "../../util/store";
import {InputText, Select} from "../../../meta/component/Input";
import {fileHttp} from "../../util/config";
import {getRouterAfter, getRouterPath} from "../../util/WebPath";
import {useLocation, useNavigate} from "react-router-dom";
import {useTranslation} from "react-i18next";
import {FileCompressType} from "../../../../common/file.pojo";
import {CardPrompt} from "../../../meta/component/Card";
import {default_doc, stringify_doc} from "../file/component/timeline/timeline_util";
// @ts-ignore
import ymlRaw  from "../../../../common/template/workflow.yml?raw"

const workflow_txt = ymlRaw


export function FileNew(props) {
    const { t } = useTranslation();
    const [format, setFormat] = useState("");

    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);
    const [name, setName] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const select_item = [
        {title:`${t("empty")}`,value:""},
        {title:`excalidraw${t("格式")}`,value:".draw"},
        {title:`${t("思维导图")}`,value:".mind"},
        {title:`${t("时间轴")}`,value:".timeline"},
        {title: `workflow${t("格式")}`, value:".act"},
        {title: `url${t("格式")}`, value:".url"},
    ]
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
            if (format === ".draw" ) {
                context = "{}";
            } else if (format === ".mind") {
                // 空思维导图：一个根节点，打开即可编辑
                context = JSON.stringify({
                    version: 1,
                    root: {id: "root", text: "中心主题", children: []}
                });
            } else if (format === ".timeline") {
                // 空时间轴：一份可直接编辑的初始文档
                context = stringify_doc(default_doc());
            } else if (format === ".act") {
                context = workflow_txt;
            }  else if (format === ".url") {
                context = `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}`;
            }
        }
        const fileName = `${showPrompt.data.dir}${r_name}`
        const rsq = await fileHttp.post('new/file', {name:fileName,context})
        if (rsq.code === 0) {
            cancel();
            if (showPrompt.data.call) {
                showPrompt.data.call();
            } else {
                navigate(getRouterPath());
            }
        }
    }

    return (<CardPrompt title={t("创建文件")} cancel={cancel} confirm={dirnew} cancel_t={t("取消")}
                        confirm_t={t("创建")}
                        context={[
                            <div className="card-content">
                                <InputText placeholderOut={t("输入文件名")} value={name}
                                           handleInputChange={(value) => setName(value)}/>
                                <Select value={format} onChange={(value:FileCompressType)=>{
                                    setFormat(value);
                                }} options={select_item}/>
                            </div>]}
                        confirm_enter={dirnew}
    />)
}
