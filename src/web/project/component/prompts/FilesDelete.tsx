import React, {useEffect} from 'react';

import {useLocation, useMatch, useNavigate} from "react-router-dom";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {fileHttp} from "../../util/config";
import {fileReq} from "../../../../common/req/file.req";
import {getByIndexs} from "../../../../common/ListUtil";
import {getRouterAfter} from "../../util/WebPath";
import {getFileNameByLocation, getFilesByIndexs} from "../file/FileUtil";
import {useTranslation} from "react-i18next";
import {RCode} from "../../../../common/Result.pojo";
import {NotyFail} from "../../util/noty";

export function FilesDelete(props) {
    const { t } = useTranslation();

    let location = useLocation();
    const navigate = useNavigate();
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectedFileList,setSelectedFileList] = useRecoilState($stroe.selectedFileList);
    const [nowFileList,setNowFileList] = useRecoilState($stroe.nowFileList);


    function cancel(){
        setShowPrompt({
            show:false,overlay: false,type: '',data: {}
        })
    }
    async function confirm() {

        if (showPrompt.data.path) {
           const r = await fileHttp.delete(showPrompt.data.path);
           if (r.code === RCode.PROTECT_FILE) {
               NotyFail("保护路径不能删除");
           }
        } else {
            const files = getFilesByIndexs(nowFileList, selectedFileList);
            for (const file of files) {
                const r = await fileHttp.delete(getFileNameByLocation(location,file.name))
                if (r.code === RCode.PROTECT_FILE) {
                    NotyFail("保护路径不能删除");
                }
            }
        }
        setShowPrompt({
            show:false,overlay: false,type: '',data: {}
        })
        if (showPrompt.data.call) {
            showPrompt.data.call();
        } else {
            navigate(location.pathname)
            setSelectedFileList([])
        }

    }

    return (
        <div className="card floating">
            <div className="card-content">
                <p>
                    {t("是否删除选中的文件")}
                </p>

            </div>
            <div className="card-action">
                <button
                    className="button button--flat button--grey" onClick={cancel}
                >
                    {t("取消")}
                </button>
                <button
                    className="button button--flat button--red" onClick={confirm}
                >
                    {t("删除")}
                </button>
            </div>
        </div>
    )
}
