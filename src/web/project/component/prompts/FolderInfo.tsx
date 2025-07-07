import {useTranslation} from "react-i18next";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import React from "react";
import {TextLine} from "../../../meta/component/Dashboard";
import { formatFileSize } from "../../../../common/ValueUtil";

export function FolderInfo() {
    const { t } = useTranslation();
    const [folder_info_list_data, setShowPrompt] = useRecoilState($stroe.folder_info_list_data);

    return (<div className={"card floating"}>
        <div className="card-title">
            <h2>{t("统计")}</h2>
        </div>
        <div style={{maxWidth: "25rem"}}>
            <TextLine left={t("文件总数量")} center={folder_info_list_data[0]}/>
            <TextLine left={t("总大小")} right={folder_info_list_data[1]} center={formatFileSize(folder_info_list_data[1])}/>
        </div>
    </div>)
}