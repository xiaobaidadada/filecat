import React, {useEffect} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {fileHttp} from "../../util/config";
import {getRouterAfter} from "../../util/WebPath";
import {useNavigate} from "react-router-dom";
import {useTranslation} from "react-i18next";

export function Paste(props) {
    const { t } = useTranslation();

    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [copyedFileList,setCopyedFileList] = useRecoilState($stroe.copyedFileList);
    const [cutedFileList,setCutedFileList] = useRecoilState($stroe.cutedFileList);
    const navigate = useNavigate();

    function cancel(){
        setShowPrompt({
            show:false,overlay: false,type: '',data:{}
        })
        if (cutedFileList.length > 0) {
            setCutedFileList([])
        } else {
            setCopyedFileList([])
        }
    }
    async function ok() {
        if (cutedFileList.length > 0) {
            const rsp = await fileHttp.post('cut',{
                files:cutedFileList,
                to:getRouterAfter('file',location.pathname)
            });
            setCutedFileList([])
        } else {
            const rsp = await fileHttp.post('copy',{
                files:copyedFileList,
                to:getRouterAfter('file',location.pathname)
            });
            setCopyedFileList([])
        }
        setShowPrompt({
            show:false,overlay: false,type: '',data:{}
        })
        navigate(location.pathname)

    }
    return <div className="card floating">
        <div className="card-content">
            <p>
                {cutedFileList.length>0?t("剪切(覆盖)确认"):t("复制(覆盖)确认")}
            </p>
        </div>
        <div className="card-action">
            <button
                className="button button--flat button--grey" onClick={cancel}
            >
                {t("取消")}
            </button>
            <button
                className="button button--flat button--red" onClick={ok}
            >
                {t("confirm")}
            </button>
        </div>
    </div>
}
