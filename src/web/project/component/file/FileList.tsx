import React, {useEffect, useRef, useState} from 'react';
import {FileItem} from "./FileItem";
import {RouteBreadcrumbs} from "../../../meta/component/RouteBreadcrumbs";
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {fileHttp} from "../../util/config";
import {Link, useLocation, useMatch} from "react-router-dom";
import {ActionButton} from "../../../meta/component/Button";
import Header from "../../../meta/component/Header";
import {getNextByLoop} from "../../../../common/ListUtil";
import {scanFiles} from "../../util/file";
import {Prompt, PromptEnum} from "../prompts/Prompt";
import {getRouterAfter} from "../../util/WebPath";
import {RCode} from "../../../../common/Result.pojo";
import {FileShell} from "../shell/FileShell";
import {getFileNameByLocation, getFilesByIndexs} from "./FileUtil";
import Noty from "noty";
import {FileRename} from "../prompts/FileRename";

export enum FileListShowTypeEmum {
    block = "",
    gallery = "gallery",
    list = "list"
}


const fileTypes = Object.values(FileListShowTypeEmum);

export function FileList() {
    const inputRef = useRef();
    let location = useLocation();
    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    const [fileType, setFileType] = useRecoilState($stroe.fileShowType);
    const [uploadFiles, setUploadFiles] = useRecoilState($stroe.uploadFiles);
    const [showPrompt, setShowPrompt] = useRecoilState($stroe.showPrompt);
    const [selectedFile, setSelectedFile] = useRecoilState($stroe.selectedFileList);
    const [copyedFileList,setCopyedFileList] = useRecoilState($stroe.copyedFileList);
    const [cutedFileList,setCutedFileList] = useRecoilState($stroe.cutedFileList);
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [shellShow,setShellShow] = useRecoilState($stroe.fileShellShow);

    const fileHandler = async () => {
        // 文件列表初始化界面
        const rsp = await fileHttp.get(getRouterAfter('file',location.pathname));
        if (rsp.code !== RCode.Sucess) {
            return;
        }
        setNowFileList(rsp.data)
        if (shellShow.show) {
            setShellShow({
                show: true,
                path: getRouterAfter('file',location.pathname)
            })
        }
    }
    // 在组件挂载后执行的逻辑
    useEffect(() => {
        const fetchData = async () => {
            await fileHandler();
        };
        fetchData();
    }, [location]);
    useEffect(() => {
        const element = inputRef.current;
        const doc = element.ownerDocument;
        doc.addEventListener("dragover", (event)=>{event.preventDefault();});
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
            setShowPrompt({show: true,type: PromptEnum.FilesUpload,overlay: false,data:{}});
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
                    path: getRouterAfter('file',location.pathname)
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
            layout:"bottomLeft"
        }).show();
    }
    function copy() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        // @ts-ignore
        setCopyedFileList(files.map(file=>getFileNameByLocation(location,file.name)));
        setCutedFileList([]);
        ok('已复制')
    }
    function cut() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        // @ts-ignore
        setCutedFileList(files.map(file=>getFileNameByLocation(location,file.name)));
        setCopyedFileList([])
        ok('已剪切')
    }
    function paste(){
        setShowPrompt({show: true,type:PromptEnum.Confirm,overlay: true,data:{}});
    }
    function dirnew() {
        setShowPrompt({show: true,type:PromptEnum.DirNew,overlay: true,data:{}});
    }
    function filenew() {
        setShowPrompt({show: true,type:PromptEnum.FileNew,overlay: true,data:{}});
    }
    function downloadFile() {
        const files = getFilesByIndexs(nowFileList, selectedFile);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            files[i]= getFileNameByLocation(location,file.name)
        }
        const url = fileHttp.getDownloadUrl(files);
        window.open(url);
    }
    function updateFile() {
        setShowPrompt({show: true,type:PromptEnum.FileRename,overlay: true,data:{}});
    }
    return (
        <div>
            <Header>
                {/*<ActionButton icon="upload_file" title={"上传"}/>*/}
                <title><h3>FileCat</h3></title>
                {selectedFile.length>0&& <ActionButton icon={"delete"} title={"删除"} onClick={()=>{setShowPrompt({show: true,type:PromptEnum.FilesDelete,overlay: true,data:{}})}}/>}
                {selectedFile.length>0&& <ActionButton icon={"content_copy"} title={"复制"} onClick={copy}/>}
                {selectedFile.length>0&& <ActionButton icon={"content_cut"} title={"剪切"} onClick={cut}/>}
                {(copyedFileList.length>0 || cutedFileList.length>0)&& <ActionButton onClick={paste} icon={"content_paste"} title={"粘贴到此处"} tip={copyedFileList.length+cutedFileList.length}/>}
                {selectedFile.length>0&& <ActionButton icon={"download"} title={"下载"} onClick={downloadFile}/>}
                {selectedFile.length === 1&& <ActionButton icon={"edit_attributes"} title={"重命名"} onClick={updateFile}/>}
                <ActionButton icon={"terminal"} title={"shell"} onClick={shellClick} />
                <ActionButton icon={"grid_view"} title={"切换样式"} onClick={switchGridView}/>
                <ActionButton icon={"create_new_folder"} title={"创建文件夹"} onClick={dirnew}/>
                <ActionButton icon={"note_add"} title={"创建文本文件"} onClick={filenew}/>
            </Header>
            <div id={"listing"} className={`mosaic file-icons ${fileType}`} ref={inputRef}>
                {<RouteBreadcrumbs baseRoute={"file"} clickFun={routerClick}></RouteBreadcrumbs>}
                {(nowFileList.folders && nowFileList.folders.length > 0) && <h2>文件夹</h2>}
                {(nowFileList.folders) &&
                    // @ts-ignore
                    (<div>{nowFileList.folders.map((v, index) => (<FileItem index={index} key={index} {...v} />))}</div>)
                }
                {(nowFileList.files && nowFileList.files.length > 0) && <h2>文件</h2>}
                {(nowFileList.files) &&
                    // @ts-ignore
                    (<div>{nowFileList.files.map((v, index) => (
                        // @ts-ignore
                        <FileItem index={index + nowFileList.folders.length} key={index} {...v}/>))}</div>)
                }
            </div>
            <FileShell />
        </div>
    )
}
