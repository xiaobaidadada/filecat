import React, {useEffect, useState} from 'react';
import {$stroe} from "../../../util/store";
import {useRecoilState} from "recoil";
import {Dropdown, Overlay, OverlayTransparent} from "../../../../meta/component/Dashboard";
import {CardPrompt, ProgressCard} from "../../../../meta/component/Card";
import {InputText, Select} from "../../../../meta/component/Input";
import {useLocation, useNavigate} from "react-router-dom";
import {NotyFail, NotySucess} from "../../../util/noty";
import {StringUtil} from "../../../../../common/StringUtil";
import {getRouterAfter} from "../../../util/WebPath";
import {FileCompressPojo, FileCompressType, FileVideoFormatTransPojo} from "../../../../../common/file.pojo";
import {ws} from "../../../util/ws";
import {CmdType, WsData} from "../../../../../common/frame/WsData";
import {useTranslation} from "react-i18next";

const levels = [];
for (let i = 1; i <= 9; i++) {
    levels.push({title: `级别${i}`, value: i});
}

export function Compress(props) {
    const {t} = useTranslation();
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [items, setItems,] = useState([{r: t("解压"), v: t("解压")}]);
    const [tar_filename, setTar_filename] = useState("");
    const [placeholder, setPlaceholder] = useState(".tar");
    const [format, setFormat] = useState(FileCompressType.tar);

    const [progress, setProgress] = useState(0);
    const [compress_level, setCompress_level] = useState(1);
    const navigate = useNavigate();
    const location = useLocation();

    const close = () => {
        setShowPrompt({show: false, type: '', overlay: false, data: {}});
    }
    const confirm = () => {
        if (!tar_filename) {
            NotyFail("文件名不能为空");
            return;
        }
        const files = showPrompt.data.files;

        const req = new FileCompressPojo();
        req.filePaths = files;
        req.format = format;
        let r_name = tar_filename;
        if (!r_name.endsWith(format)) {
            r_name = r_name + "." + format;
        }
        req.tar_filename = `${getRouterAfter('file', location.pathname)}${r_name}`;
        req.token = localStorage.getItem("token");
        req.compress_level = compress_level;
        ws.sendData(CmdType.file_compress, req);
        ws.addMsg(CmdType.file_compress_progress, (wsData: WsData<any>) => {
            const v = parseInt(wsData.context);
            setProgress(v)
            if (v === 100) {
                NotySucess("完成");
                navigate(location.pathname);
                ws.unConnect();
                close()
            }
            setSelectList([])
            setClickList([])
        })
        ws.subscribeUnconnect(() => {
            NotyFail("发生错误");
            close()
        })
    }
    return (
        <div>
            <CardPrompt title={t("压缩文件")} cancel={close} confirm={confirm} cancel_t={t("取消")}
                        confirm_t={t("确定")}
                        context={!progress ? [
                                <Select value={format} onChange={(value: FileCompressType) => {
                                    let v;
                                    if (value === FileCompressType.tar) {
                                        v = FileCompressType.tar;
                                    } else if (value === FileCompressType.zip) {
                                        v = FileCompressType.zip;
                                    } else if (value === FileCompressType.gzip) {
                                        v = "tar.gz";
                                    }
                                    setFormat(value);
                                    setPlaceholder(`.${v}`)
                                }} options={[{
                                    title: `tar ${t("格式")}`,
                                    value: FileCompressType.tar
                                }, {title: `zip ${t("格式")}`, value: FileCompressType.zip}, {
                                    title: `gz ${t("格式")}`,
                                    value: FileCompressType.gzip
                                }]}/>,
                                <Select value={compress_level} onChange={(value) => {
                                    const v = parseInt(value);
                                    setCompress_level(v);
                                }} options={levels}/>,
                                <InputText placeholder={placeholder} placeholderOut={t("压缩到")} value={tar_filename}
                                           handleInputChange={(value) => setTar_filename(value)}/>] :
                            [<div>{t("进度")}:</div>,
                                <ProgressCard progress={progress}/>]}/>
            <Overlay click={close}/>
        </div>)
}
