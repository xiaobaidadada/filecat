import React, {useEffect, useRef, useState} from 'react';

import {RouteBreadcrumbs} from "../../../../meta/component/RouteBreadcrumbs";
import {useRecoilState} from "recoil";
import {$stroe} from "../../../util/store";
import {fileHttp, sshHttp} from "../../../util/config";
import {Link, useLocation, useMatch, useNavigate} from "react-router-dom";
import Header from "../../../../meta/component/Header";
import {RCode} from "../../../../../common/Result.pojo";
import {SshPojo} from "../../../../../common/req/ssh.pojo";
import {RemoteShell} from "../../shell/RemoteShell";
import {file_sort, getFilesByIndexs, using_drop_file_upload} from "../../file/FileUtil";
import {FileTypeEnum, GetFilePojo} from "../../../../../common/file.pojo";
import {InputTextIcon} from "../../../../meta/component/Input";
import {useTranslation} from "react-i18next";
import {NotyFail, NotySucess} from "../../../util/noty";
import {formatFileSize} from '../../../../../common/ValueUtil';
import {getShortTime} from "../../../../project/util/common_util";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import {isAbsolutePath, path_join} from "pty-shell/dist/path_util";
import {RemoteMenu} from "./RemoteMenu";
import {FileListLoad_file_folder_for_linux} from "../../file/FileListLoad";

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

let pre_search: GetFilePojo;

export function setPreSearch(data: GetFilePojo) {
    pre_search = data;
}

export function RemoteLinuxFileList(props: RemoteLinuxFileListProps) {
    const {t} = useTranslation();


    const location = useLocation();
    const [nowFileList, setNowFileList] = useRecoilState($stroe.nowFileList);
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [clickList, setClickList] = useRecoilState($stroe.clickFileList);
    const [sshInfo, setSSHInfo] = useRecoilState<any>($stroe.sshInfo);

    const [search, setSearch] = useState("");
    const navigate = useNavigate();
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);

    const fileHandler = async (path?: string) => {
        // 文件列表初始化界面
        const req = new SshPojo();
        req.key = sshInfo.key;
        req.dir = path ? path : `/${getRouterAfter('remoteShell', getRouterPath())}`
        // req.dir = joinPaths(...shellNowDir);
        // req.username = props.data.username;
        // req.password = props.data.password;
        // req.domain = props.data.domain;
        // req.port = props.data.port;
        const rsp = await sshHttp.post("get/dir", req);
        if (rsp.code !== RCode.Sucess) {
            NotyFail("连接失败")
            return;
        }
        const {folders, files} = rsp.data || {};
        for (const item of files ?? []) {
            item.origin_size = item.size;
            item.size = formatFileSize(item.size);
            item.show_mtime = item.mtime ? getShortTime(item.mtime) : "";
        }
        for (const item of folders ?? []) {
            item.show_mtime = item.mtime ? getShortTime(item.mtime) : "";
        }
        const data = {folders: folders || [], files: files || []};
        // 排序一下
        file_sort(data, user_base_info.user_data.dir_show_type)
        setNowFileList(data);
        pre_search = data;
    }
    const fetchData = async () => {
        await fileHandler();
    };

    useEffect(() => {
        routerClick();
        fetchData();
    }, [location]);

    function routerClick() {
        setSelectList([])
        setClickList([])
    }


    // 搜索
    const searchHanle = () => {
        if (!pre_search) {
            return;
        }
        setSelectList([])
        setClickList([])
        const files = [];
        const folders = [];
        for (const file of pre_search.files ?? []) {
            if (file.name.includes(search)) {
                files.push(file);
            }
        }
        for (const folder of pre_search.folders ?? []) {
            if (folder.name.includes(search)) {
                folders.push(folder);
            }
        }
        setNowFileList({files, folders});
    }

    const clickBlank = (event) => {
        if (event.target === event.currentTarget) {
            setSelectList([])
        }
    }

    const routeBreadcrumbsEnter = (path) => {
        if (isAbsolutePath(path)) {
            fileHandler(path);
        } else {
            navigate(path_join(getRouterPath(), path))
        }
        setSelectList([])
        setClickList([])
        setNowFileList({files: [], folders: []});
    }
    return (
        <React.Fragment>
            <Header left_children={<InputTextIcon handleEnterPress={searchHanle} placeholder={t("搜索当前目录")}
                                                  icon={"search"} value={""} handleInputChange={(v) => {
                setSearch(v)
            }} max_width={"25em"}/>}>

                {/*<ActionButton icon={"arrow_back"} title={t("返回")} onClick={backDir}/>*/}
                <RemoteMenu close={props.close}/>
            </Header>
            <RouteBreadcrumbs baseRoute={"remoteShell"} clickFun={routerClick}
                              input_path_enter={routeBreadcrumbsEnter}></RouteBreadcrumbs>
            <FileListLoad_file_folder_for_linux
                handleContextMenu={() => {
                }}
                clickBlank={clickBlank}
                file_list={nowFileList.files}
                folder_list={nowFileList.folders}
                fileHandler={fileHandler}
            />
            <RemoteShell/>
        </React.Fragment>
    )
}
