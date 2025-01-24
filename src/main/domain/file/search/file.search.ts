import {Worker, isMainThread, parentPort} from 'worker_threads';
import {CmdType, WsData} from "../../../../common/frame/WsData";
import {LogViewerPojo} from "../../../../common/file.pojo";
import {Wss} from "../../../../common/frame/ws.server";
import {settingService} from "../../setting/setting.service";
import path from "path";
import {ws} from "../../../../web/project/util/ws";
import {SysPojo} from "../../../../common/req/sys.pojo";
import {FileWorkMessage} from "./file.type";

const fs = require("fs");


export function search_file_cancel (data: WsData<LogViewerPojo>) {
    const wss = data.wss as Wss;
    const worker = wss.dataMap.get('worker');
    if(worker) {
        worker.postMessage({type: 4});
        worker.terminate().then((status) => {
            console.log('子线程已被终止');
        }).catch((err) => {
            console.error('终止子线程时出错:', err);
        });
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
    // 获取文件的元数据
    const stats = fs.statSync(file_path);
    const query_text_buffer = Buffer.from(pojo.query_text)
    if(stats.size <= query_text_buffer.length || query_text_buffer.length === 0) {
        const result = new WsData<SysPojo>(CmdType.search_file_progress);
        result.context = 100;
        wss.sendData(result.encode());
        return;
    }
    const worker = new Worker(path.join(__dirname,'file.search.worker'));
    wss.dataMap.set('worker', worker);
    const close = ()=>{
        worker.postMessage({type: 4});
        worker.terminate().then((status) => {
            console.log('子线程已被终止');
        }).catch((err) => {
            console.error('终止子线程时出错:', err);
        });
        wss.dataMap.delete('worker');
    }
    wss.setClose(()=>{
        close();
    })
    worker.postMessage({type: 1, start: 0, end: stats.size,file_path ,query_text_buffer});
    worker.on('message', (message: FileWorkMessage) => {
        if(message.type === 2) {
            const result = new WsData<SysPojo>(CmdType.search_file_index);
            result.context = message.find_index;
            wss.sendData(result.encode());
        } else if (message.type === 5) {
            const result = new WsData<SysPojo>(CmdType.search_file_progress);
            result.context = message.progress;
            wss.sendData(result.encode());
        } else if (message.type === 3) {
            // 结束了
            const result = new WsData<SysPojo>(CmdType.search_file_progress);
            result.context = 100;
            wss.sendData(result.encode());
            close();
        }
    });
    // 监听子线程退出
    worker.on('exit', (code) => {
        console.log(`子线程退出，退出码 ${code}`);
        wss.dataMap.delete('worker');
    });
}

