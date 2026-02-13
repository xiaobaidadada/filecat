
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
    docs_search,

    // sys_info,
    // sys_info_send,
}