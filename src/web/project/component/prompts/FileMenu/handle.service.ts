import {ws} from "../../../util/ws";
import {CmdType} from "../../../../../common/frame/WsData";
import {workflow_pre_input, WorkflowReq, WorkRunType} from "../../../../../common/req/file.req";
import {getRouterAfter, getRouterPath} from "../../../util/WebPath";
import { useAtom } from 'jotai';
import {$stroe} from "../../../util/store";
import {useTranslation} from "react-i18next";

export const run_workflow= async (filename,code:3|4,inputs:workflow_pre_input[] = []) =>{

    const pojo = new WorkflowReq();
    pojo.path = `${getRouterAfter('file', getRouterPath())}${filename}`;
    pojo.inputs = inputs;
    if(code===3) {
        pojo.run_type = WorkRunType.start;
    } else if(code===4) {
        pojo.run_type = WorkRunType.stop;
    }
    await ws.sendData(CmdType.workflow_exec, pojo)
}


export enum common_menu_type {
    stop_workflow = 4,
    real_time_workflow = 5,
    run_workflow = 3,
    run_real_time_workflow = "3_1",
    open_text = 1,
    run_workflow_by_pre_inputs = 6,
    logviwer_text = "utf8",
    logviwer_utf8 = "utf8",
    logviwer_utf16 = "utf16",
    logviwer_utf32 = "utf32",
    logviwer_gbk = "gbk",
    logviwer_gb2312 = "gb2312",
    logviwer_gb18030 = "gb18030",
    // logviwer_usc2 = "usc2",
    logviwer_windows1252 = "windows1252",
    // logviwer_big5 = "big5",
    // logviwer_ios_8859_1 = "ios-8859-1",
    logviwer_wrap = "logviwer_wrap",     // 日志以自动换行方式打开
    logviwer_nowrap = "logviwer_nowrap", // 日志以不换行方式打开

    sutdio = "sutdio",
    folder_size_info = "folder_size_info",
    file_quick_cmd = "file_quick_cmd",
    file_copy_name = "file_copy_name", // 复制名字
    file_copy_ab_path = "file_copy_ab_path", // 复制绝对路径
    file_copy_now_path = "file_copy_now_path", // 复制相对项目的路径

    un_compress = "un_compress",
    share_file = "share_file",
    share_file_download = "share_file_download",
    share_file_copy_url = "share_file_copy_url",
    ai_load_one_file = "ai_load_one_file",
    ai_del_one_file = "ai_del_one_file",
    file_base_info = "file_base_info",
    file_delete = "file_delete",
    file_rename = "file_rename",
    file_download = "file_download",
    sqlite_query = "sqlite_query",
    blank_search_mode = "blank_search_mode",

    image_open = "image_open",
    image_preview = "image_preview",
    // 以所见即所得编辑器打开 md（双击仍是预览，这里提供专门的编辑入口）
    md_editor_open = "md_editor_open",
    // 挂载：把该目录挂载到网盘/远程协议
    mount_dir = "mount_dir",
    // 取消挂载：把该目录恢复成本地目录
    unmount_dir = "unmount_dir",
    // 查看/编辑该目录的挂载配置
    mount_config = "mount_config",
}
