import {ThreadsMain} from "../threads.main";
import {BinFileUtil} from "../../domain/bin/bin.file.util";


export const ThreadsFilecat = new ThreadsMain()

export function start_worker_threads() {
    if (ThreadsFilecat.is_running) {
        return;
    }
    const file_p = __filename.endsWith('.ts') ?  BinFileUtil.get_bin_path('threads.work.filecat.ts')
        : BinFileUtil.get_bin_path('threads.work.filecat.js')
    ThreadsFilecat.start_worker_threads(file_p)
}
