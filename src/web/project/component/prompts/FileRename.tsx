import React, {useEffect, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {InputText} from "../../../meta/component/Input";
import {fileHttp} from "../../util/config";
import {getRouterAfter} from "../../util/WebPath";
import {useLocation, useNavigate} from "react-router-dom";
import {getFilesByIndexs} from "../file/FileUtil";

export function FileRename(props) {
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectedFile, setSelectedFile] = useRecoilState($stroe.selectedFileList);
    const [nowFileList,setNowFileList] = useRecoilState($stroe.nowFileList);
    const [name, setName] = useState("");
    const navigate = useNavigate();
    const location = useLocation();

    const cancel=()=> {
        setShowPrompt({show: false,type: "",overlay: false,data:{}})
    }
    const getName = () =>{
        const files = getFilesByIndexs(nowFileList, selectedFile);
        return files[0].name;
    }
    const dirnew = async ()=>{
        if (!name || selectedFile.length!==1) {
            cancel()
            return;
        }
        const files = getFilesByIndexs(nowFileList, selectedFile);
        const newName = `${getRouterAfter('file',location.pathname)}${name}`
        const filename = `${getRouterAfter('file',location.pathname)}${files[0].name}`
        const rsq = await fileHttp.post('rename', {name:filename,newName:newName})
        if (rsq.code === 0) {
            cancel();
            navigate(location.pathname);
        }
    }
    return (<div className={"card floating"}>
        <div className="card-title">
            <h2>修改名字</h2>
        </div>
        <div className="card-content">
            <InputText placeholderOut={"输入新名字"} value={getName()} handleInputChange={(value)=>setName(value)} />
        </div>
        <div className="card-action">
            <button className="button button--flat button--grey" onClick={cancel}>
                取消
            </button>
            <button className="button button--flat" onClick={dirnew}>
                修改
            </button>
        </div>
    </div>)
}
