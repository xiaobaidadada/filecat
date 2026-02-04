import {FileItem} from "./FileItem";
import React, {useContext, useEffect, useMemo, useRef, useState} from 'react';
import {useRecoilState} from "recoil";
import {$stroe} from "../../util/store";
import {
    file_show_item,
    using_add_div_wheel_event, using_drop_file_upload, using_file_page_handle_width_auto, using_file_quick_keyboard
} from "./FileUtil";
import {useTranslation} from "react-i18next";
import {use_file_to_running} from "../../util/store.util";
import {PromptEnum} from "../prompts/Prompt";
import {scanFiles} from "../../util/file";
import {RemoteLinuxFileItem} from "../proxy/remotelinux/RemoteLinuxFileItem";


// 同时渲染文件夹和文件的基本列表 用于linux远程连接
export function FileListLoad_file_folder_for_linux(
    {
        handleContextMenu,
        file_list,
        folder_list,
        clickBlank,
        fileHandler
    }: {
        handleContextMenu: any, // 右键空白
        file_list?: file_show_item[],
        folder_list?: file_show_item[],
        clickBlank: any // 点击空白
        fileHandler: any
    }) {
    // 基础信息 通用
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);
    const inputRef = useRef(null); // 用于保证 大小伸缩变化
    const {t} = useTranslation();

    // 页面自适应 通用
    const itemWidth = using_file_page_handle_width_auto()
    const {file_is_running} = use_file_to_running();
    const [shellShow, setShellShow] = useRecoilState($stroe.fileShellShow);
    const folders_len = useMemo(() => folder_list?.length ?? 0, [folder_list])

    using_drop_file_upload(inputRef, PromptEnum.SshUpload)
    // 快捷键
    using_file_quick_keyboard(file_list,folder_list,inputRef)


    useEffect(() => {
        return () => {
            if (shellShow.show) {
                setShellShow({show: false, path: ''})
            }
        }
    }, []);


    return <div onContextMenu={handleContextMenu} id={"listing"} style={{paddingBottom: '10rem'}}
                className={`mosaic file-icons ${user_base_info?.user_data?.file_list_show_type ?? ''}`} ref={inputRef}
        // onScroll={()=>{
        //     console.log(111)
        // }}
    >
        {(folder_list && folder_list.length > 0) && <h2>{t("文件夹")}</h2>}
        {(folder_list) &&
            (<div onClick={clickBlank}>{folder_list.map((v, index) => (
                <React.Fragment key={index}>
                    <RemoteLinuxFileItem fileHandler={fileHandler} itemWidth={itemWidth} index={index}  {...v} />
                </React.Fragment>))}
            </div>)
        }
        {(file_list && file_list.length > 0) && <h2 onClick={clickBlank}>{t("文件")}</h2>}
        {(file_list) &&
            (<div onClick={clickBlank}>
                {file_list.map((v, index) => (
                    <React.Fragment key={index + folders_len}>
                        <RemoteLinuxFileItem fileHandler={fileHandler} icon={file_is_running(v.name) ? "refresh" : undefined} itemWidth={itemWidth}
                                  index={index + folders_len}  {...v}  />
                    </React.Fragment>
                ))}
            </div>)
        }
    </div>
}


// 同时渲染文件夹和文件的基本列表 用于本地文件
export function FileListLoad_file_folder_for_local(
    {
        handleContextMenu,
        file_list,
        folder_list,
        clickBlank
    }: {
        handleContextMenu: any, // 右键空白
        file_list?: file_show_item[],
        folder_list?: file_show_item[],
        clickBlank: any // 点击空白
    }) {
    // 基础信息 通用
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);
    const inputRef = useRef(null); // 用于保证 大小伸缩变化
    const {t} = useTranslation();

    // 页面自适应 通用
    const itemWidth = using_file_page_handle_width_auto()
    const {file_is_running} = use_file_to_running();
    const [shellShow, setShellShow] = useRecoilState($stroe.fileShellShow);

    const folders_len = useMemo(() => folder_list?.length ?? 0, [folder_list])

    using_drop_file_upload(inputRef,PromptEnum.FilesUpload)
    // 快捷键
    using_file_quick_keyboard(file_list,folder_list,inputRef)


    useEffect(() => {
        return () => {
            if (shellShow.show) {
                setShellShow({show: false, path: ''})
            }
        }
    }, []);


    return <div onContextMenu={handleContextMenu} id={"listing"} style={{paddingBottom: '10rem'}}
                className={`mosaic file-icons ${user_base_info?.user_data?.file_list_show_type ?? ''}`} ref={inputRef}
                // onScroll={()=>{
                //     console.log(111)
                // }}
    >
        {(folder_list && folder_list.length > 0) && <h2>{t("文件夹")}</h2>}
        {(folder_list) &&
            (<div onClick={clickBlank}>{folder_list.map((v, index) => (
                <React.Fragment key={index}>
                    <FileItem itemWidth={itemWidth} index={index}  {...v} />
                </React.Fragment>))}
            </div>)
        }
        {(file_list && file_list.length > 0) && <h2 onClick={clickBlank}>{t("文件")}</h2>}
        {(file_list) &&
            (<div onClick={clickBlank}>
                {file_list.map((v, index) => (
                    <React.Fragment key={index + folders_len}>
                        <FileItem icon={file_is_running(v.name) ? "refresh" : undefined} itemWidth={itemWidth}
                                  index={index + folders_len}  {...v}  />
                    </React.Fragment>
                ))}
            </div>)
        }
    </div>
}

// 使用分页的方式
export function FileListLoad_file_folder_for_local_by_page(
    {
        handleContextMenu,
        list,
        clickBlank
    }: {
        handleContextMenu: any, // 右键空白
        list?: file_show_item[],
        clickBlank: any // 点击空白
    }) {
    const [user_base_info, setUser_base_info] = useRecoilState($stroe.user_base_info);
    const inputRef = useRef(null); // 用于保证 大小伸缩变化
    const {t} = useTranslation();
    const itemWidth = using_file_page_handle_width_auto()
    const {file_is_running} = use_file_to_running();
    const [shellShow, setShellShow] = useRecoilState($stroe.fileShellShow);
    const [enterKey, setEnterKey] = useRecoilState($stroe.enterKey);
    const [selectList, setSelectList] = useRecoilState($stroe.selectedFileList);
    const [file_page, set_file_page] = useRecoilState($stroe.file_page);

    // 快捷键
    using_file_quick_keyboard(list,[],inputRef)
    // const folders_len = useMemo(() => folder_list?.length ?? 0, [folder_list])


    // using_file_quick_keyboard(file_list,folder_list,isFocused)
    using_drop_file_upload(inputRef,PromptEnum.FilesUpload)

    using_add_div_wheel_event(inputRef,()=>{
        set_file_page(prev => {
            if (prev.page_num < 0) return prev; // 没有下一项了
            return { page_size: prev.page_size, page_num: prev.page_num + 1 };
        });
    },()=>{
        // console.log('顶部')
    })
    useEffect(() => {
        return () => {
            if (shellShow.show) {
                setShellShow({show: false, path: ''})
            }
        }
    }, []);


    return <div onContextMenu={handleContextMenu} id={"listing"} style={{paddingBottom: '10rem'}}
                className={`mosaic file-icons ${user_base_info?.user_data?.file_list_show_type ?? ''}`} ref={inputRef}
        // onScroll={()=>{
        //     console.log(111)
        // }}
    >
        {(list) &&
            (<div onClick={clickBlank}>
                {list.map((v, index) => (
                    <React.Fragment key={index }>
                        <FileItem icon={file_is_running(v.name) ? "refresh" : undefined} itemWidth={itemWidth}
                                  index={index}  {...v}  />
                    </React.Fragment>
                ))}
            </div>)
        }
    </div>
}