import {CmdType, WsData} from "../../../../common/frame/WsData";
import {LogViewerPojo} from "../../../../common/file.pojo";
import {Wss} from "../../../../common/frame/ws.server";
import {settingService} from "../../setting/setting.service";
import path from "path";
import {SysPojo} from "../../../../common/req/sys.pojo";
import {FileServiceImpl} from "../file.service";
import {userService} from "../../user/user.service";
import {BinFileUtil} from "../../bin/bin.file.util";
import {ThreadsMain} from "../../../threads/threads.main";
import {threads_msg_type} from "../../../threads/threads.type";

const fs = require("fs");


export function search_file_cancel (data: WsData<LogViewerPojo>) {
    const wss = data.wss as Wss;
    const worker = wss.dataMap.get('worker');
    if(worker) {
        ThreadsMain.emit(threads_msg_type.file_search_close, {ram_id:worker})
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
    if(!ThreadsMain.is_running) {
        const file_p = BinFileUtil.get_bin_path('threads.work.js')
            || BinFileUtil.get_bin_path('threads.work.ts')
        // console.log('文件',file_p)
        if(!ThreadsMain.start_worker_threads(file_p)) return;
    }
    const ram_id = ThreadsMain.generate_random_id()
    wss.dataMap.set('worker', ram_id);
    const close = ()=>{
        ThreadsMain.emit(threads_msg_type.file_search_close,{file_path,ram_id})
        wss.dataMap.delete('worker');
        ThreadsMain.off_by_listener_id(ram_id)
    }
    wss.setClose(()=>{
        close();
    })
    ThreadsMain.emit(threads_msg_type.file_search_start,{file_path,ram_id})
    ThreadsMain.emit(threads_msg_type.file_search,{ram_id,start: 0, end: stats.size,file_path ,query_text_buffer})
    ThreadsMain.on((msg)=>{
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
    },ram_id)
}

