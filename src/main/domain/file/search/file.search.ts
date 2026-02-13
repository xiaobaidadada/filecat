import {CmdType, WsData} from "../../../../common/frame/WsData";
import {LogViewerPojo} from "../../../../common/file.pojo";
import {Wss} from "../../../../common/frame/ws.server";
import {settingService} from "../../setting/setting.service";
import path from "path";
import {SysPojo} from "../../../../common/req/sys.pojo";
import {FileServiceImpl} from "../file.service";
import {userService} from "../../user/user.service";
import {BinFileUtil} from "../../bin/bin.file.util";
import {threads_msg_type} from "../../../threads/threads.type";
import {start_worker_threads, ThreadsFilecat} from "../../../threads/filecat/threads.filecat";

const fs = require("fs");


export function search_file_cancel (data: WsData<LogViewerPojo>) {
    const wss = data.wss as Wss;
    const worker = wss.dataMap.get('worker');
    if(worker) {
        ThreadsFilecat.emit(threads_msg_type.file_search_close, {ram_id:worker})
        wss.dataMap.delete('worker');
    }
}
export function search_file(data: WsData<LogViewerPojo>) {
    const wss = data.wss as Wss;
    if (wss.dataMap.get('worker')) {
        return;
    }
    const pojo = data.context as LogViewerPojo;
    const root_path = settingService.getFileRootPath(pojo.token);
    const file_path = path.join(root_path, decodeURIComponent(pojo.path));
    userService.check_user_path(wss.token, file_path)
    // 获取文件的元数据
    const stats = fs.statSync(file_path);
    const query_text_buffer = pojo.encoding === null || pojo.encoding === "utf8" ? Buffer.from(pojo.query_text): FileServiceImpl.utf8ToEncoding(pojo.query_text,pojo.encoding); // Buffer.from(pojo.query_text)
    if(stats.size <= query_text_buffer.length || query_text_buffer.length === 0) {
        const result = new WsData<SysPojo>(CmdType.search_file_progress);
        result.context = 100;
        wss.sendData(result.encode());
        return;
    }
    // 确保开启，并且不要第一次就开启
    start_worker_threads()
    const ram_id = ThreadsFilecat.generate_random_id()
    wss.dataMap.set('worker', ram_id);
    const on_message = (msg)=>{
        const { type  } = msg
        const {find_index, progress,ram_id} = msg.data
        if(msg.data.ram_id !== ram_id) return;
        if(type === threads_msg_type.search_file_index) {
            const result = new WsData<SysPojo>(CmdType.search_file_index);
            result.context = find_index;
            wss.sendData(result.encode());
        } else if (type === threads_msg_type.search_file_progress) {
            const result = new WsData<SysPojo>(CmdType.search_file_progress);
            result.context = progress;
            wss.sendData(result.encode());
        } else if (type === threads_msg_type.search_file_end) {
            // 结束了
            const result = new WsData<SysPojo>(CmdType.search_file_progress);
            result.context = 100;
            wss.sendData(result.encode());
            close();
        }
    }
    const close = ()=>{
        ThreadsFilecat.emit(threads_msg_type.file_search_close,{file_path,ram_id})
        wss.dataMap.delete('worker');
        ThreadsFilecat.off_message('message',on_message)
    }
    wss.setClose(()=>{
        close();
    })
    ThreadsFilecat.emit(threads_msg_type.file_search_start,{file_path,ram_id})
    ThreadsFilecat.emit(threads_msg_type.file_search,{ram_id,start: 0, end: stats.size,file_path ,query_text_buffer})
    ThreadsFilecat.on_message('message',on_message)
}

