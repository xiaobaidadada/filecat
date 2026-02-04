import React, {useEffect, useRef, useState} from 'react';
import {useTranslation} from "react-i18next";
import {useLocation, useNavigate} from "react-router-dom";
import {use_auth_check} from "../../../util/store.util";
import {ActionButton} from "../../../../meta/component/Button";
import {PromptEnum} from "../../prompts/Prompt";
import {getFilesByIndexs, unsing_switch_grid_view} from "../../file/FileUtil";
import {FileTypeEnum} from "../../../../../common/file.pojo";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {getNextByLoop} from "../../../../../common/ListUtil";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {NotySucess} from "../../../util/noty";
import {fileTypes} from "../../../../../common/req/user.req";
import {removeLastDir} from '../../../util/ListUitl';


export function RemoteMenu(props: { close: any }) {
    const {t} = useTranslation();
    let location = useLocation();
    const navigate = useNavigate();
    const {check_user_auth} = use_auth_check();

    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    // const [fileType, setFileType] = useRecoilState($stroe.fileShowType);
    const [uploadFiles, setUploadFiles] = useRecoilState($stroe.uploadFiles);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectedFile, setSelectedFile] = useRecoilState($stroe.selectedFileList);
    const [enterKey, setEnterKey] = useRecoilState($stroe.enterKey);
    const [copyedFileList, setCopyedFileList] = useRecoilState($stroe.copyedFileList);
    const [cutedFileList, setCutedFileList] = useRecoilState($stroe.cutedFileList);
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [shellShow, setShellShow] = useRecoilState($stroe.remoteShellShow);
    const [sshInfo, setSSHInfo] = useRecoilState<any>($stroe.sshInfo);

    const  switchGridView = unsing_switch_grid_view()


    function shellClick() {
        if (!shellShow.show) {
            setShellShow({
                show: true,
                path: `/${getRouterAfter('remoteShell', getRouterPath())}`
                // path: joinPaths(...shellNowDir)
            })
        } else {
            setShellShow({
                show: false,
                path: ''
            })
        }
    }

    function ok(txt) {
        NotySucess(txt);
    }

    function copy() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        setCopyedFileList(files.map(file => `/${getRouterAfter('remoteShell', getRouterPath())}${file.name}`));
        setCutedFileList([]);
        ok('已复制')
    }

    function cut() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        setCutedFileList(files.map(file => `/${getRouterAfter('remoteShell', getRouterPath())}${file.name}`));
        setCopyedFileList([])
        ok('已剪切')
    }

    function paste() {
        setShowPrompt({show: true, type: PromptEnum.SshPaste, overlay: true, data: {}});
    }

    function dirnew() {
        setShowPrompt({show: true, type: PromptEnum.SshNewDir, overlay: true, data: {}});
    }

    function filenew() {
        setShowPrompt({show: true, type: PromptEnum.SshNewFile, overlay: true, data: {}});
    }

    // useEffect(() => {
    //     if (showPrompt && showPrompt.data && showPrompt.data.ok) {
    //         fetchData();
    //     }
    // }, [showPrompt]);

    function downloadFile() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        const target = `/${getRouterAfter('remoteShell', getRouterPath())}${decodeURIComponent(files[0]['name'])}`
        const url = `/api/ssh/download?file=${target}&key=${sshInfo['key']}&token=${localStorage.getItem('token')}`;
        window.open(url);
    }

    function updateFile() {
        setShowPrompt({show: true, type: PromptEnum.SshReName, overlay: true, data: {}});
    }

    const uploadFile = () => {
        setShowPrompt({
            show: true, type: PromptEnum.UploadFile, overlay: true, data: {
                call: (event) => {

                    let files = (event.currentTarget as HTMLInputElement)?.files;
                    if (!files) return;

                    let folder_upload = !!files[0].webkitRelativePath;

                    const uploadFiles: any = [];
                    const dirs = new Set(); // 文件夹需要提前创建
                    for (let i = 0; i < files.length; i++) {
                        const file = files[i];
                        const fullPath = folder_upload ? file.webkitRelativePath : `${file.webkitRelativePath}${file.name}`;
                        file['fullPath'] = fullPath;
                        if (folder_upload) {
                            dirs.add(removeLastDir(fullPath));
                        }
                        uploadFiles.push(file);
                        // uploadFiles.push({
                        //     file,
                        //     name: file.name,
                        //     size: file.size,
                        //     isDir: false,
                        //     fullPath,
                        // });
                    }
                    const list = [];
                    if (folder_upload) {
                        for (const file of dirs) {
                            list.push({
                                isDir: true,
                                fullPath: file,
                                name: file
                            })
                        }
                    }
                    list.push(...uploadFiles);
                    setUploadFiles(list);
                    setShowPrompt({show: true, type: PromptEnum.SshUpload, overlay: false, data: {}});
                }
            }
        });
    }
    return <React.Fragment>
        {selectedFile.length > 0 && <ActionButton icon={"delete"} title={t("删除")} onClick={() => {
            setShowPrompt({show: true, type: PromptEnum.SshDelete, overlay: true, data: {}})
        }}/>}
        {selectedFile.length > 0 && <ActionButton icon={"content_copy"} title={t("复制")} onClick={copy}/>}
        {selectedFile.length > 0 && <ActionButton icon={"content_cut"} title={t("剪切")} onClick={cut}/>}
        {(copyedFileList.length > 0 || cutedFileList.length > 0) &&
            <ActionButton onClick={paste} icon={"content_paste"} title={t("粘贴到此处")}
                          tip={copyedFileList.length + cutedFileList.length}/>}
        {(selectedFile.length === 1 && nowFileList.files.length >= 1 && getFilesByIndexs(nowFileList, selectedFile)[0]['type'] !== FileTypeEnum.folder) &&
            <ActionButton icon={"download"} title={t("下载")} onClick={downloadFile}/>}
        {selectedFile.length === 1 &&
            <ActionButton icon={"edit_attributes"} title={t("重命名")} onClick={updateFile}/>}
        <ActionButton icon={"terminal"} title={"shell"} onClick={shellClick}/>
        <ActionButton icon={"grid_view"} title={t("切换样式")} onClick={switchGridView}/>
        <ActionButton icon={"create_new_folder"} title={t("创建文件夹")} onClick={dirnew}/>
        <ActionButton icon={"note_add"} title={t("创建文本文件")} onClick={filenew}/>
        <ActionButton icon="upload_file" title={"上传"} onClick={uploadFile}/>
        <ActionButton icon={"close"} title={t("关闭")} onClick={() => {
            props.close();
        }}/>
    </React.Fragment>
}