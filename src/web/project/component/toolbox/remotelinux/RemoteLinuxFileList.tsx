import React, {useEffect, useRef, useState} from 'react';

import {RouteBreadcrumbs} from "../../../../meta/component/RouteBreadcrumbs";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {fileHttp, sshHttp} from "../../../util/config";
import {Link, useLocation, useMatch} from "react-router-dom";
import {ActionButton} from "../../../../meta/component/Button";
import Header from "../../../../meta/component/Header";
import {getNextByLoop, joinPaths} from "../../../../../common/ListUtil";
import {scanFiles} from "../../../util/file";
import {Prompt, PromptEnum} from "../../prompts/Prompt";
import {RCode} from "../../../../../common/Result.pojo";
import Noty from "noty";
import {RemoteLinuxFileItem} from "./RemoteLinuxFileItem";
import {SshPojo} from "../../../../../common/req/ssh.pojo";
import {RemoteShell} from "../../shell/RemoteShell";
import {getFilesByIndexs} from "../../file/FileUtil";
import {FileTypeEnum} from "../../../../../common/file.pojo";

export enum FileListShowTypeEmum {
    block = "",
    gallery = "gallery",
    list = "list"
}


const fileTypes = Object.values(FileListShowTypeEmum);

export class RemoteLinuxFileListProps {
    close: () => void;
    data: {
        domain: string;
        port: number,
        username: string;
        password: string;
        dir: string;
    }
}

export function RemoteLinuxFileList(props: RemoteLinuxFileListProps) {
    const inputRef = useRef();
    // let location = useLocation();
    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    const [fileType, setFileType] = useRecoilState($stroe.fileShowType);
    const [uploadFiles, setUploadFiles] = useRecoilState($stroe.uploadFiles);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectedFile, setSelectedFile] = useRecoilState($stroe.selectedFileList);
    const [copyedFileList, setCopyedFileList] = useRecoilState($stroe.copyedFileList);
    const [cutedFileList, setCutedFileList] = useRecoilState($stroe.cutedFileList);
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [shellShow, setShellShow] = useRecoilState($stroe.remoteShellShow);
    const [shellNowDir, setShellNowDir] = useRecoilState($stroe.shellNowDir);
    const [sshInfo, setSSHInfo] = useRecoilState($stroe.sshInfo);

    const fileHandler = async () => {
        // 文件列表初始化界面
        const req = new SshPojo();
        req.dir = joinPaths(...shellNowDir);
        req.username = props.data.username;
        req.password = props.data.password;
        req.domain = props.data.domain;
        req.port = props.data.port;
        const rsp = await sshHttp.post("get/dir", req);
        if (rsp.code !== RCode.Sucess) {
            return;
        }
        const {folders, files} = rsp.data||{};
        setNowFileList({folders:folders||[], files:files||[]});
    }
    const fetchData = async () => {
        await fileHandler();
    };
    // 在组件挂载后执行的逻辑
    useEffect(() => {
        routerClick();
        fetchData();
    }, []); //location 暂时不做监听，也无法监听
    useEffect(() => {
        const element = inputRef.current;
        const doc = element.ownerDocument;
        doc.addEventListener("dragover", (event) => {
            event.preventDefault();
        });
        doc.addEventListener("drop", async (event) => {
            event.preventDefault();
            let dt = event.dataTransfer;
            // console.log(dt)
            let el = event.target;
            // console.log(el,dt)
            if (dt.files.length <= 0) return;
            for (let i = 0; i < 5; i++) {
                if (el !== null && !el.classList.contains("item")) {
                    el = el.parentElement;
                }
            }
            // 文件名不会包含绝对路径
            let files = await scanFiles(dt);
            setUploadFiles(files);
            setShowPrompt({show: true,type: PromptEnum.SshUpload,overlay: false,data:{}});
        });

    }, []);

    function switchGridView() {
        setFileType(getNextByLoop(fileTypes, fileType))
    }

    function routerClick() {
        setSelectList([])
        setClickList([])
    }

    function shellClick() {
        if (!shellShow.show) {
            setShellShow({
                show: true,
                path: joinPaths(...shellNowDir)
            })
        } else {
            setShellShow({
                show: false,
                path: ''
            })
        }
    }

    function ok(txt) {
        new Noty({
            type: 'success',
            text: txt,
            timeout: 1000, // 设置通知消失的时间（单位：毫秒）
            layout: "bottomLeft"
        }).show();
    }

    function copy() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        setCopyedFileList(files.map(file => joinPaths(...shellNowDir, file.name)));
        setCutedFileList([]);
        ok('已复制')
    }

    function cut() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        setCutedFileList(files.map(file => joinPaths(...shellNowDir, file.name)));
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

    useEffect(() => {
        if (showPrompt && showPrompt.data && showPrompt.data.ok) {
            fetchData();
        }
    }, [showPrompt]);

    function downloadFile() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        const url = `/ssh/download?file=${joinPaths(...shellNowDir,files[0]['name'])}&domain=${props.data.domain}&port=${props.data.port}&username=${props.data.username}&password=${props.data.password}`;
        window.open(url);
    }

    function updateFile() {
        setShowPrompt({show: true, type: PromptEnum.SshReName, overlay: true, data: {}});
    }

    const backDir = async () => {
        const req = new SshPojo();
        Object.assign(req, sshInfo);
        if (shellNowDir.length <= 1) {
            return;
        }
        const newList = shellNowDir.slice(0, shellNowDir.length - 1)
        setShellNowDir(newList)
        req.dir = joinPaths(...newList);
        const rsp = await sshHttp.post("get/dir", req);
        if (rsp.code !== RCode.Sucess) {
            return;
        }
        const {folders, files} = rsp.data||{};
        setNowFileList({folders:folders||[], files:files||[]});
        if (shellShow.show) {
            setShellShow({
                show: true,
                path: joinPaths(...newList)
            })
        }
    }

    return (
        <div>
            <Header>
                {/*<ActionButton icon="upload_file" title={"上传"}/>*/}
                <title><h3>FileCat</h3></title>
                <ActionButton icon={"arrow_back"} title={"返回"} onClick={backDir}/>
                {selectedFile.length > 0 && <ActionButton icon={"delete"} title={"删除"} onClick={() => {
                    setShowPrompt({show: true, type: PromptEnum.SshDelete, overlay: true, data: {}})
                }}/>}
                {selectedFile.length > 0 && <ActionButton icon={"content_copy"} title={"复制"} onClick={copy}/>}
                {selectedFile.length > 0 && <ActionButton icon={"content_cut"} title={"剪切"} onClick={cut}/>}
                {(copyedFileList.length > 0 || cutedFileList.length > 0) &&
                    <ActionButton onClick={paste} icon={"content_paste"} title={"粘贴到此处"}
                                  tip={copyedFileList.length + cutedFileList.length}/>}
                {(selectedFile.length === 1 &&  nowFileList.files.length>=1 && nowFileList.folders.length>=1 &&getFilesByIndexs(nowFileList, selectedFile)[0]['type'] !== FileTypeEnum.folder) &&
                    <ActionButton icon={"download"} title={"下载"} onClick={downloadFile}/>}
                {selectedFile.length === 1 &&
                    <ActionButton icon={"edit_attributes"} title={"重命名"} onClick={updateFile}/>}
                <ActionButton icon={"terminal"} title={"shell"} onClick={shellClick}/>
                <ActionButton icon={"grid_view"} title={"切换样式"} onClick={switchGridView}/>
                <ActionButton icon={"create_new_folder"} title={"创建文件夹"} onClick={dirnew}/>
                <ActionButton icon={"note_add"} title={"创建文本文件"} onClick={filenew}/>
                <ActionButton icon={"close"} title={"关闭"} onClick={() => {
                    props.close();
                }}/>
            </Header>
            <div id={"listing"} className={`mosaic file-icons ${fileType}`} ref={inputRef}>
                {(!!nowFileList && !!nowFileList.folders && nowFileList.folders.length > 0) && <h2>文件夹</h2>}
                {(!!nowFileList && !!nowFileList.folders) &&
                    (<div>{nowFileList.folders.map((v, index) => (
                        // @ts-ignore
                        <RemoteLinuxFileItem index={index} key={index} {...v} />))}</div>)
                }
                {(!!nowFileList && !!nowFileList.folders && nowFileList.files.length > 0) && <h2>文件</h2>}
                {(!!nowFileList && !!nowFileList.folders) &&
                    // @ts-ignore
                    (<div>{nowFileList.files.map((v, index) => (
                        // @ts-ignore
                        <RemoteLinuxFileItem index={index + nowFileList.folders.length} key={index} {...v}/>))}</div>)
                }
            </div>
            <RemoteShell/>
        </div>
    )
}
