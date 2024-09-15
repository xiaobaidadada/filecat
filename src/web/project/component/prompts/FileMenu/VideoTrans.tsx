import React, {useEffect, useState} from 'react';
import {Dropdown, Overlay, OverlayTransparent} from "../../../../meta/component/Dashboard";
import {CardPrompt, ProgressCard} from "../../../../meta/component/Card";
import {InputText} from "../../../../meta/component/Input";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {useLocation, useNavigate} from "react-router-dom";
import {NotyFail, NotySucess} from "../../../util/noty";
import {StringUtil} from "../../../../../common/StringUtil";
import {getRouterAfter} from "../../../util/WebPath";
import {FileVideoFormatTransPojo} from "../../../../../common/file.pojo";
import {ws} from "../../../util/ws";
import {CmdType, WsData} from "../../../../../common/frame/WsData";
import {FileMenuData} from "../../../../../common/FileMenuType";
import {useTranslation} from "react-i18next";
import {FileMenuItem} from "./FileMenu";


export function VideoTrans(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [items, setItems,] = useState([{r:`${t("转到")}mp4`,v:"mp4"},{r:`${t("转到")}flv`,v:"flv"},{r:t("自定义"),v:""}]);
    const [prompt, setPrompt] = useState("");
    const [newFileName, setNewFileName] = useState("");
    const [is_opt, setIs_opt] = useState(true);

    const [progress, setProgress] = useState(0);
    const navigate = useNavigate();
    const location = useLocation();

    const close = ()=>{
        setShowPrompt({show: false, type: '', overlay: false,data: {}});
    }
    const click = async (v)=> {
        setPrompt(v);
        setIs_opt(false);
        setNewFileName(`${showPrompt.data.filename}.${v}`);
        // NotyFail("功能暂未实现");
        // close();
    }
    const confirm = ()=> {
        if (!prompt || !newFileName) {
            NotyFail("不能为空");
            return
        }
        if (prompt===StringUtil.getFileExtension(showPrompt.data.filename)) {
            NotyFail("和原文件格式后缀一样");
            return;
        }
        const sourceFileName = `${getRouterAfter('file',location.pathname)}${showPrompt.data.filename}`;
        const targetFileName = `${getRouterAfter('file',location.pathname)}${newFileName}`;

        const req = new FileVideoFormatTransPojo();
        req.to_format = prompt;
        req.to_filename = targetFileName;
        req.source_filename = sourceFileName;
        req.token = localStorage.getItem("token");
        ws.sendData(CmdType.file_video_trans,req);
        ws.addMsg(CmdType.file_video_trans_progress,(wsData: WsData<any>)=>{
            const v = parseInt(wsData.context);
            setProgress(v)
            if (v === 100) {
                NotySucess("完成");
                navigate(location.pathname);
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
                <CardPrompt title={t("视频格式转换")} cancel={close} confirm={confirm} cancel_t={t("取消")}
                            confirm_t={t("确定")}
                            context={!progress ? [<InputText placeholderOut={t("ffmpeg支持的目标格式")}
                                                             placeholder={"flv mp4 ..."}
                                                             value={prompt}
                                                             handleInputChange={(value) => setPrompt(value)}/>,
                                    <InputText placeholderOut={t("目标文件名")} value={newFileName}
                                               handleInputChange={(value) => setNewFileName(value)}/>,
                                    <div>{t("生成文件的目标文件在本目录下")}</div>
                                ] :
                                [<div>{t("进度")}:</div>,
                                    <ProgressCard progress={progress}/>]}/>
                <Overlay click={close}/>
            </div>)}
    </div>)
}
