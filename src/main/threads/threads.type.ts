
export type WorkerMessage = {
    id?: number;
    type: threads_msg_type;
    data: any;
    error?:string;
};


export enum threads_msg_type {
    hello = 1,
    file_search_start,
    file_search,
    file_search_close,
    search_file_index,
    search_file_progress,
    search_file_end,

    docs_init,
    docs_add,
    docs_del,
    docs_close,
    docs_search= 12,

    // sys_info,
    // sys_info_send,

    file_watch_init,
    file_watch_send,
    file_watch_close,
    file_watch_apply,
    file_watch_sync_task_get,

    // token 估算
    estimate_token_count,

}