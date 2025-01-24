
export interface FileWorkMessage {
    type: number; // 1 是父线程请求  2 是 发现下标父线程接受 查询结果  3 是查询全部完成 4 是终止 下一次的文件buffer读取 查询 5 是进度
    file_path: string;
    query_text_buffer: Buffer;
    start: number;
    end: number;
    find_index: number[]; // 发现的下标
    progress:number;
}