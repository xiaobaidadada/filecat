import {register_threads_worker_handler, threads_send} from "../../threads/threads.work";
import {threads_msg_type} from "../../threads/threads.type";


export function start_sys_worker() {

    register_threads_worker_handler(threads_msg_type.sys_info, async (data) => {

        threads_send({
            type: threads_msg_type.sys_info_send,
            data: {node_memory_usage: process.memoryUsage()}
        })
    })
}