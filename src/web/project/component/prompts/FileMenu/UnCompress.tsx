import React, {useEffect, useState} from 'react';
import {$stroe} from "../../../util/store";
import {useRecoilState} from "recoil";
import {Dropdown, Overlay, OverlayTransparent} from "../../../../meta/component/Dashboard";
import {CardPrompt, ProgressCard} from "../../../../meta/component/Card";
import {InputText} from "../../../../meta/component/Input";
import {useLocation, useNavigate} from "react-router-dom";
import {NotyFail, NotySucess} from "../../../util/noty";
import {StringUtil} from "../../../../../common/StringUtil";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {FileCompressPojo, FileCompressType, FileVideoFormatTransPojo} from "../../../../../common/file.pojo";
import {ws} from "../../../util/ws";
import {CmdType, WsData} from "../../../../../common/frame/WsData";
import {useTranslation} from "react-i18next";
import {FileMenuItem} from "./FileMenu";

export function UnCompress(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [items, setItems,] = useState([{r:t("解压"),v:t("解压")}]);
    const [tarDir, setTarDir] = useState(undefined);
    const [is_opt, setIs_opt] = useState(true);

    const [progress, setProgress] = useState(0);
    const navigate = useNavigate();
    const location = useLocation();

    const close = ()=>{
        setShowPrompt({show: false, type: '', overlay: false,data: {}});
    }
    const click = async (v)=> {
        setIs_opt(false);
    }
    const confirm = ()=> {
        const extension = StringUtil.getFileExtension(showPrompt.data.filename) ?? "" as string;

        const sourceFileName = `${getRouterAfter('file',getRouterPath())}${showPrompt.data.filename}`;

        const req = new FileCompressPojo();
        let format;
        if (extension === FileCompressType.tar) {
            format = FileCompressType.tar;
        } else if (extension === FileCompressType.zip) {
            format = FileCompressType.zip;
        } else if (extension === FileCompressType.gzip || extension === "tgz") {
            format = FileCompressType.gzip;
        } else if (extension === FileCompressType.rar) {
            format = FileCompressType.rar;
        } else {
            NotyFail("不支持的文件后缀");
            return;
        }
        req.format = format;
        req.source_file = sourceFileName;
        req.tar_dir = tarDir;
        req.token = localStorage.getItem("token");
        ws.sendData(CmdType.file_uncompress,req);
        ws.addMsg(CmdType.file_uncompress_progress,(wsData: WsData<any>)=>{
            const v = parseInt(wsData.context);
            setProgress(v)
            if (v === 100) {
                NotySucess("完成");
                navigate(getRouterPath());
                ws.unConnect();
                close()
            }
        })
        ws.subscribeUnconnect(()=>{
            NotyFail("发生错误");
            close()
        })
    }
    return (<div>
        {showPrompt.show && (is_opt ? <OverlayTransparent click={close} children={<FileMenuItem x={showPrompt.data.x} y={showPrompt.data.y} items={items} click={click}/>}/> :
            <div>
                <CardPrompt title={t("解压文件")} cancel={close} confirm={confirm} cancel_t={t("取消")} confirm_t={t("确定")}
                            context={!progress ? [
                                <InputText placeholder={t("当前目录")} placeholderOut={t("解压到")} value={tarDir} handleInputChange={(value) => setTarDir(value)}/>] :
                                [<div>{t("进度")}:</div>,
                                    <ProgressCard progress={progress}/>]}/>
                <Overlay click={close}/>
            </div>)}
    </div>)
}
