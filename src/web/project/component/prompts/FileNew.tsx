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
import {GcfgPageType} from "../../../../common/gcfg.pojo";
// @ts-ignore
import ymlRaw  from "../../../../common/template/workflow.yml?raw"

const workflow_txt = ymlRaw

const gcfg_type_options = [
    {title: '字典(Dict)', value: GcfgPageType.Dict},
    {title: '二维表(TwoDim)', value: GcfgPageType.TwoDim},
    {title: '常量(Const)', value: GcfgPageType.Const},
];

export function FileNew(props) {
    const { t } = useTranslation();
    const [format, setFormat] = useState("");

    const [showPrompt, setShowPrompt] = useAtom($stroe.showPrompt);
    const [name, setName] = useState("");
    const [gcfgType, setGcfgType] = useState<GcfgPageType>(GcfgPageType.Dict);
    const navigate = useNavigate();
    const location = useLocation();

    const select_item = [
        {title:`${t("empty")}`,value:""},
        {title:`excalidraw${t("格式")}`,value:".draw"},
        {title: `workflow${t("格式")}`, value:".act"},
        {title: `gcfg${t("格式")}`, value:".gcfg"},
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
            } else if (format === ".act") {
                context = workflow_txt;
            } else if (format === ".gcfg") {
                let cfgBlock = '';
                if (gcfgType === GcfgPageType.Dict) {
                    cfgBlock = `config:\n  type: dict\n  enName: ''\n  dict:\n    keys: []\n    valueType: string\ndata:\n  rows: []\n`;
                } else if (gcfgType === GcfgPageType.Const) {
                    cfgBlock = `config:\n  type: const\n  enName: ''\n  const_:\n    keys: []\ndata:\n  values: {}\n`;
                } else if (gcfgType === GcfgPageType.TwoDim) {
                    cfgBlock = `config:\n  type: twodim\n  enName: ''\n  twoDim:\n    xKeys: []\n    yKeys: []\n    valueType: string\ndata:\n  cells: {}\n`;
                }
                context = cfgBlock;
            } else if (format === ".url") {
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
                                {format === '.gcfg' && (
                                    <Select value={gcfgType} onChange={(value: GcfgPageType) => setGcfgType(value)} options={gcfg_type_options} />
                                )}
                            </div>]}
                        confirm_enter={dirnew}
    />)
}
