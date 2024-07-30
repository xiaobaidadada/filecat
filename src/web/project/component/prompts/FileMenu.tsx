import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {Dropdown, DropdownTag, Overlay, OverlayTransparent} from "../../../meta/component/Dashboard";
import {NotyFail, NotySucess} from "../../util/noty";
import {CardPrompt, ProgressCard} from "../../../meta/component/Card";
import {InputText} from "../../../meta/component/Input";
import {getRouterAfter} from "../../util/WebPath";
import {StringUtil} from "../../../../common/StringUtil";
import {FileVideoFormatTrans} from "../../../../common/file.pojo";
import {fileHttp} from "../../util/config";
import {wss} from "tencentcloud-sdk-nodejs";
import {ws} from "../../util/ws";
import {CmdType, WsData} from "../../../../common/frame/WsData";


export function FileMenu() {
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [items, setItems,] = useState([{r:"转到mp4",v:"mp4"},{r:"转到flv",v:"flv"},{r:"自定义",v:""}]);
    const [prompt, setPrompt] = useState();
    const [newFileName, setNewFileName] = useState();
    const [is_opt, setIs_opt] = useState(true);

    const [progress, setProgress] = useState(0);

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

        const req = new FileVideoFormatTrans();
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
        {is_opt &&
            <div
                style={{
                    position: 'absolute',
                    top: `${showPrompt.data.y}px`,
                    left: `${showPrompt.data.x}px`,
                    backgroundColor: 'white',
                    // border: '1px solid black',
                    padding: '5px',
                    zIndex: 999999,
                }}
            >
                <Dropdown items={items} click={click} pre_value={"123"}/>
            </div>}


        {showPrompt.show && (is_opt ? <OverlayTransparent click={close}/> :
            <div>
                <CardPrompt title={"视频格式转换"} cancel={close} confirm={confirm} cancel_t={"取消"} confirm_t={"确定"}
                            context={!progress ? [<InputText placeholderOut={"ffmpeg支持的目标格式"} placeholder={"flv mp4 ..."}
                                                 value={prompt} handleInputChange={(value) => setPrompt(value)}/>,
                                <InputText placeholderOut={"目标文件名"} value={newFileName}
                                           handleInputChange={(value) => setNewFileName(value)}/>,
                                <div>生成文件的目标文件在本目录下</div>
                            ] :
                                [<div>进度:</div>,
                                    <ProgressCard progress={progress}/>]}/>
                <Overlay click={close}/>
            </div>)}
    </div>)
}
