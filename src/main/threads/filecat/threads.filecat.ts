import {ThreadsMain} from "../threads.main";
import {BinFileUtil} from "../../domain/bin/bin.file.util";


export const ThreadsFilecat = new ThreadsMain()

export function start_worker_threads() {
    if(ThreadsFilecat.is_running) {
       return;
    }
    const file_p = BinFileUtil.get_bin_path('threads.work.filecat.ts')  // 优先本地开发环境
        || BinFileUtil.get_bin_path('threads.work.filecat.js')
    ThreadsFilecat.start_worker_threads(file_p)
}
