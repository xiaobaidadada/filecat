import {register_threads_worker_handler, threads_send} from "../../../threads/threads.work";
import {threads_msg_type, WorkerMessage} from "../../../threads/threads.type";

const fs = require("fs");

function copySubarray(buffer, start, end) {
    // 计算目标缓冲区的大小
    const length = end - start;

    // 创建一个新的缓冲区来存储复制的数据
    const newBuffer = Buffer.alloc(length);

    // 使用 copy 方法将数据复制到新的缓冲区
    buffer.copy(newBuffer, 0, start, end);

    // 返回新的缓冲区
    return newBuffer;
}
// 在读取文件做 io 的时候还是可以接受到父线程的终止信号的

// 构建坏字符规则表 也就是每个字符在字符串中最后一次出现的位置
function buildBadCharTable(pattern) {
    const table = {};
    const m = pattern.length;

    for (let i = 0; i < m; i++) {
        // 存储模式中每个字符的最后一个出现位置
        table[pattern[i]] = i;
    }
    return table;
}


/**
 *  好规则后缀也利用上可以更加提高效率 但是提高的不多 这里不实现了
 * @param text 前提文本
 * @param pattern 需要匹配的文本
 * @param list 多个结果
 */
function boyerMooreSearch(text, pattern, list) {
    const badCharTable = buildBadCharTable(pattern);
    const text_len = text.length;
    const pattern_len = pattern.length;
    const text_len_pattern_len = text_len - pattern_len;
    let i = 0; // 文本指针
    while (i <= text_len_pattern_len) {  // 保证匹配部分不会越界
        let last_p_i = pattern_len - 1;  // 模式的最后一个字符
        // 从后往前匹配字符
        while (last_p_i >= 0 && text[i + last_p_i] === pattern[last_p_i]) {
            last_p_i--;
        }

        if (last_p_i < 0) { // 其实只能是 -1
            // 如果模式完全匹配
            // console.log("Found pattern at index: " + i);
            list.push(i);
            i += (i + pattern_len < text_len) ?
                pattern_len - badCharTable[text[i + pattern_len]] || pattern_len // 往前移动 移动按最后一位的往前一位
                : 1;  // 如果模式完全匹配，跳过已匹配部分 其实已经break了
        } else {
            // 根据坏字符规则进行跳跃
            const badCharLast = badCharTable[text[i + last_p_i]]; // 当前txt位置的字符 对应在模式字符串中最后一个的位置，移动也是相对于这次  尾对尾头对头的位置
            const badCharShift = badCharLast !== undefined
                ? last_p_i - badCharLast // 移动到最后一个位置 可能为0
                : last_p_i + 1; // 不存在字符 往前移动一位就好了
            i += Math.max(badCharShift, 1);  // 确保至少移动一位 如果刚好第一位就是对应的字符 那么值是0 这是不行的
        }
    }
}
const file_done_map = {}

export function file_search_start() {
    register_threads_worker_handler(threads_msg_type.file_search, async (msg: WorkerMessage)=>{
        // 查询
        const {start, end, file_path, query_text_buffer,ram_id} = msg.data;
        let haveReadSize = 0; // 已经读取的字节数
        let bufferContent = Buffer.alloc(0);
        const fd = fs.openSync(file_path, "r");
        const read_len = 1024 * 1024*2;
        let text_start_index = 0;
        while (haveReadSize < end) {
            if (file_done_map[ram_id]) break;
            const buffer = Buffer.alloc(read_len); // 2 MB
            // 返回实际读取的字节数
            let bytesRead = fs.readSync(fd, buffer,
                0, // 相对于当前的偏移位置
                buffer.length, // 读取的长度
                haveReadSize // 当前位置
            );
            if (bytesRead === 0) break;
            haveReadSize += bytesRead;
            bufferContent = Buffer.concat([bufferContent, buffer.subarray(0, bytesRead)]);
            threads_send({
                type: threads_msg_type.search_file_progress,
                data: {
                    progress:(haveReadSize * 100/end).toFixed(0),
                    ram_id
                }
            })
            const r_list = [];
            boyerMooreSearch(bufferContent, query_text_buffer, r_list); // 从头遍历到尾部
            if (r_list.length > 0) {
                for (let i=0;i<r_list.length;i++) {
                    r_list[i] += text_start_index;
                }
                threads_send({
                    type: threads_msg_type.search_file_index,
                    data: {
                        find_index: r_list,
                        ram_id
                    }
                })
            }
            text_start_index += (bufferContent.length - query_text_buffer.length); // 加上删除的
            bufferContent = copySubarray(bufferContent,bufferContent.length - query_text_buffer.length,bufferContent.length); // 留下 文本长度再长一点 留下本次差一个字符就匹配成功的可能性
        }
        threads_send({
            type: threads_msg_type.search_file_end,
            data: { ram_id}
        })
        fs.closeSync(fd);
        return "ok"
    })
    register_threads_worker_handler(threads_msg_type.file_search_close, async (msg: WorkerMessage)=>{
        const {ram_id} = msg.data;
        file_done_map[ram_id] = true;
        return "ok"
    })
    register_threads_worker_handler(threads_msg_type.file_search_start, async (msg: WorkerMessage)=>{
        const {ram_id} = msg.data;
        delete file_done_map[ram_id];
        return "ok"
    })
}

