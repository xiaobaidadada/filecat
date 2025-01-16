/**
 * 有一些子进程 必须要 pty 环境 这里是没有办法的
 * 一个标准的 pty 需要具备以下功能：
 * 输入输出流：处理标准输入、标准输出和标准错误。
 * 环境和工作目录管理：设置子进程的环境变量和工作目录。
 * 终端特性：模拟终端的大小、信号和模式。
 * 子进程管理：启动和管理子进程，处理进程的退出状态。
 * 读取输出与写入输入：捕获输出并发送输入，模拟用户交互。
 * 信号和控制字符支持：处理回车、换行等控制字符，并支持信号转发。
 */
import {getShell, getSys} from "./shell.service";
import {SysEnum} from "../../../common/req/user.req";

/**
 * 功能说明：
 * 1. 有普通的编辑器功能 对于有子进程执行的时候 会保留子进程的输出 在输出的最后进程编辑
 * 2. 支持编辑的各种移动选择删除插入
 * 3. 支持 ls pwd 等内置命令 ， 除了 cd 所有命令都可以自定义
 * 4. 不存在的命令会被用子进程执行
 * 5. 对于特殊的 shell 命令 会使用  node-pty 来执行 并让shell托管所有的输入输出数据
 * 6. 使用了shell: true 参数 系统的默认shell可以支持管道等操作，还可以支持程序路劲查找的功能
 */

const cmd_list = ['ls', 'cd', 'pwd']; // 仅支持这三个内置命令 cd 命令是唯一支持参数的


/**
 *  \r 是回车 光标移动到最右边 \n 是换行，当前位置下一行 和\x1b[1B 作用一样
 *  \x1b 是  ESC 后面跟着控制字符
 */
// [ (左中括号) 这个符号是“CSI”（控制序列介绍符）的开始标志。它用于引入一个更复杂的控制序列，说明接下来的字符是一些终端控制命令的组成部分
const ctrl_list = [
    '\x1b[A', // 向上箭头 \x1b 是转义字符（ESC） [A 是 ANSI 转义序列中的“上箭头”键的代码
    '\x1b[B', // 向下
    '\x1b[C', // 向右
    '\x1b[D', // 向左
    '\x7F',  // del 或者 baskspce 删除换行符
    '\x01', // ctrl + a 全选
    '\x03', // ctrl + c 可以是复制 和 退出
    '\x1b[H', // home
    '\x1b[F', // end
    '\x1b[3~', // delete 删除选中
    '\x1b[1;2D', // 光标向左移动了 一个字符
    '\x1b[1;2C', // [1;2C 向右移动了 1个字符
    '\x1b[1;2H', // shift + home
    '\x1b[1;2F', // shift + end
    '\x1b[1;5D', // ctrl 向左
    '\x1b[1;5C', // ctrl 向右
]

const cancel_ctrl_value = '\x1b[0m'; // 取消控制符号的值

const ctrl_set = new Set(ctrl_list);
// 命令能不能支持的情况
export enum exec_type {
    not = -1, // 不能执行
    auto_child_process = 0, // 使用内置子线程执行(除了cd命令)
    not_pty = 1, // 使用node_pty 执行(前提是传入了 node_pty)
}
interface prompt_call_result {
    char_num: number; // \x1b 这样的控制字符会占据一个空格 而后面的[1;2D 会占据实际字符 所以要自己统计好数量
    str: string;
}
interface Param {
    cwd: string, // 工作目录
    not_use_node_pre_cmd_exec?: boolean, // 不是使用node预先定义的功能 可以用于浏览器
    node_pty?: any; // 如果传入了 node_pty 则可以使用node-pty来执行 shell 命令
    cols?: number,
    rows?: number,
    env?: any,
    on_call?: (data: string) => void,
    copy_handle?: (data: string) => void,
    prompt_call?: (cwd: string) => prompt_call_result,
    node_pty_shell_list?:string[], // 一些必须用 node_pty 来执行的命令
    check_exe_cmd?: (exe_cmd: string,params:string[]) => exec_type, // 检查这个命令是否能执行
}

type CmdHandler = (params: string[], send_prompt?: (data: string) => void) => void;

export class PtyShell {

    public rows = 100; // 这些参数是对某些程序才会有作用的
    public cols = 100;
    public cwd = ""; // 当前的cwd
    public env = {};

    constructor(param: Param) {
        this.reset_option(param);
        if (!this.not_use_node_pre_cmd_exec) {
            this.node_require.fs = require("fs");
            this.node_require.path = require("path");
            this.node_require.child_process = require('child_process');
        }
        this.on_call(this.raw_prompt);
    }

    private cmd_set = new Set(cmd_list);

    private shell_set:Set<string>;

    private node_require = {} as { path: any, fs: any, child_process: any };

    private not_use_node_pre_cmd_exec = false;
    private cmd_exec_map = new Map<string, CmdHandler>();

    private prompt_call: (cwd) => prompt_call_result;
    private prompt_call_len:number;

    private is_running = true;
    private check_exe_cmd: (exe_cmd: string,params:string[]) => exec_type;

    private child_now_line = '';

    private on_call: (data: string) => void = (data: string) => {
    };

    private copy_handle?: (data: string) => void;

    private on_child_kill_call?: (code) => void;

    private node_pty: any;
    private child;
    private is_pty: boolean = false;

    private line = "";
    private line_index = -1; // 当前指针在 某个字符（后面)

    private select_line = "";
    private select_start = -2;
    private select_end = -2;

    private history_line: string[] = [];
    private history_line_index = -1;

    /**
     * public method
     */

    public reset_option(param: Param) {
        for (let key of Object.keys(param)) {
            if(key === 'node_pty_shell_list') {
                this.shell_set = new Set(param[key]);
            }
            this[key] = param[key];
        }
    }

    public add_cmd_handle(exe_cmd: string, handle: CmdHandler) {
        this.cmd_exec_map.set(exe_cmd, handle);
        this.cmd_set.add(exe_cmd);
    }

    public close(): void {
        this.is_running = false;
        this.close_child();
    }

    public kill(): void {
        this.close();
    }

    /**
     *  处理字符串内容工具函数 防止输出的时候 在尾部单词截断
     * @param str
     */
    public cols_handle(str: string) {
        if (!str || str.length <= this.cols) return str;
        const max_index = str.length - 1;
        const list = [];

        let last_index = 0;
        let index = PtyShell.readFullCharIndex(str, 0, this.cols);

        while (index < max_index) {
            if (!this.is_empty(str[index]) && (!this.is_empty(str[index - 1]) || !this.is_empty(str[index + 1]))) {
                for (let f = index - 1; f >= last_index; f--) {
                    if (this.is_empty(str[f]) || f === 0) {
                        list.push(str.substring(last_index, f + 1));
                        last_index = f;
                        index = f + PtyShell.readFullCharIndex(str, f + 1, this.cols);
                    }
                }
            } else {
                list.push(str.substring(last_index, index));
                last_index = index;
                index = index + PtyShell.readFullCharIndex(str, index + 1, this.cols);
            }
        }
        if (index >= max_index) {
            list.push(str.substring(last_index));
        }
        return list.join('\n\r');
    }

    /**
     *  on输出函数 重置
     * @param on_call
     */
    public on(on_call: (data: string) => void) {
        this.on_call = on_call;
    }

    public on_child_kill(on_call: (code) => void) {
        this.on_child_kill_call = on_call;
    }

    /**
     * 向pty写入数据
     * @param data
     */
    public write(data: string) {
        if (this.child && this.is_pty) {
            // 终端shell 完全 托管给 别的程序
            this.spawn_write(data);
            return;
        }
        if (ctrl_set.has(data)) {
            // 不改变 编辑器的 指针
            this.ctrl_exec(data);
            return;
        } else if (data.startsWith('\x1b')) {
            // 是控制字符但是没有 对应的处理删除
            return;
        }
        // 插入数据
        let enter_index = this.get_enter_index(data); // 从换行符开始截取一部分插入
        if (this.is_line_end) {
            // 在最后插入
            if (enter_index !== -1) {
                // 有换行
                if (data.length > 1) {
                    // 不是单个的换行符 但是包含换行
                    this.multiple_line(data, enter_index);
                } else {
                    this.parse_exec();
                }
            } else {
                this.on_call(data);
                this.line += data;
                this.line_index += data.length;
            }
        } else {
            // 在某个地方插入
            if (enter_index === -1) {
                // 还没有换行 只是插入
                this.insert_line(data);
            } else {
                this.multiple_line(data, enter_index);
            }

        }
    }

    /**
     *  static method
     */

    // 判断一个字符是全角还是半角
    public static isFullCharWidth(char) {
        // 计算字符的 UTF-8 编码字节长度
        const byteLength = Buffer.byteLength(char, 'utf8');

        // 如果字符的字节长度大于 1，说明是全角字符
        return byteLength > 1;
    }

    // 从start_index往前多少个位置获取指定数量的 半角 字符(宽字符算两个)
    public static readFullCharIndex(str: string, start_index: number, len: number) {
        if (!str) return 0;
        if (start_index >= str.length) return 0;
        let num = 0;
        let char_num = 0;
        for (let i = start_index; i < str.length; i++) {
            if (this.isFullCharWidth(str[i])) {
                num += 2;
            } else {
                num++;
            }
            char_num++;
            if (num >= len) return char_num;
        }
        return char_num;
    }

    // 获取字符串中有多少个 字符（将宽字符统计成两个)
    public static  get_full_char_num(str: string) {
        if (!str) return 0;
        let char_num = 0;
        for (let i = 0; i < str.length; i++) {
            if (this.isFullCharWidth(str[i])) {
                char_num += 2;
            } else {
                char_num++;
            }
        }
        return char_num;
    }


    /**
     * private method
     */

    private get raw_prompt() {
        let c;
        if(this.prompt_call) {
            const {str,char_num} = this.prompt_call(this.cwd);
            c=str;
            this.prompt_call_len = char_num;
        } else {
            c = `${this.cwd}:# `;
            this.prompt_call_len = PtyShell.get_full_char_num(c);
        }
        return c;
    }

    private get enter_prompt() {
        return `\n\r${this.raw_prompt}`;
    }


    private clear_line() {
        this.line_index = -1;
        this.line = "";
    }

    // 光标是不是在尾部
    private get is_line_end() {
        return this.line_index + 1 === this.line.length;
    }

    private insert_line(str: string) {
        // 在某个地方插入
        let arr = this.line.split('');
        if (this.line_index === -1) {
            arr = [str, ...arr];
        } else {
            arr.splice(this.line_index + 1, 0, str);
        }
        this.line = arr.join('');
        this.line_index += str.length;
        this.update_line({line_add_num: 1});
    }

    private close_child() {
        this.child_now_line = '';
        if (this.child) {
            this.child.kill(); // 不同平台信号不同 win 默认 SIGHUP
            this.child = undefined;
        }
    }

    private next_not_enter = false;

    private send_and_enter(str: string, send_prompt = false) {
        try {
            if (typeof str == "string") {
                const list = [];
                let i = 0;
                const last_i = str.length - 1;
                for (let j = 0; j < str.length; j++) {
                    if (j < last_i) {
                        const v = `${str[j]}${str[j + 1]}`;
                        if (v === '\n\r' || v === '\r\n') {
                            j++; // 多跳一个字符
                            continue;
                        }
                    }
                    if (str[j] === '\r' || str[j] === '\n') {
                        list.push(str.substring(i, j));
                        i = j + 1;
                    }
                }
                if (i === 0 || i !== last_i)
                    list.push(str.substring(i));
                if (this.child) {
                    // 添加子进程的提示换行
                    this.child_now_line = list[list.length - 1];
                }
                str = list.join('\n\r'); // 把所有的回车替换一下换行
            }
            if (str) {
                if (this.next_not_enter) {
                    this.on_call(`${str}`); // 在下一行输出
                } else {
                    this.on_call(`\n\r${str}`); // 在下一行输出
                }
                this.next_not_enter = str.endsWith('\n\r') || str.endsWith('\r\n'); // 下一次不用换行了
            }
            if (!this.child || send_prompt) {
                this.on_call(`${this.enter_prompt}`);
            }
            this.clear_line();
        } catch (e) {
            console.log(e)
        }
    }



    // 重新更新显示本行 也许可以更节省的更新 文本 powershell 这样的每次都是全部更新 暂时和他一样
    private update_line(param?: {
        all_line_ctrl?: string, // 只用于内部使用 最多使用一个控制字符且要以 \x1b 开头
        line_add_num?: number,
        line_reduce_num?: number,
        p_line?: string
    }) {
        const prompt = !this.child ? this.raw_prompt : this.child_now_line;
        let len = (!this.child?this.prompt_call_len:PtyShell.get_full_char_num(prompt)) + this.line_char_index; // 字符串前面的字符数量
        if (param && param.line_add_num) {
            len += param.line_add_num;
        } else if (param && param.line_reduce_num) {
            len -= param.line_reduce_num;
        }
        const line = param?.p_line ?? this.line;
        const cancel_ctrl = param?.all_line_ctrl !== undefined || param?.p_line !== undefined ? cancel_ctrl_value : "";
        const updateLineString = `\x1b[?25l\r\x1b[0K${prompt}${param?.all_line_ctrl ?? line}\x1b[${len}G\x1b[?25h${cancel_ctrl}`;
        /**
         * \x1b[?25l: 隐藏光标
         * \r: 回车，移动光标到行首
         * \x1b[0K: 清空当前行光标右侧的内容
         * \x1b[21G: 将光标移动到当前行的第 21 列
         * \x1b[?25h: 显示光标
         * \x1b[0m 是后面的颜色重置 不要影响前面的
         */
        this.on_call(updateLineString);
    }

    private cancel_selected() {
        this.select_line = '';
        this.select_start = -2;
        this.select_end = -2;
    }

    private get line_char_index() {
        if (this.line_index === -1) return 0;
        return PtyShell.get_full_char_num(this.line.substring(0, this.line_index + 1));
    }

    private ctrl_exec(str: string) {
        let cancel_selected = true;
        switch (str) {
            case "\x1b[A": {
                // 向上
                const index = this.history_line_index === -1 ? this.history_line.length - 1 : this.history_line_index - 1;
                if (index >= 0) {
                    this.line = this.history_line[index];
                    this.history_line_index = index;
                }
                this.line_index = this.line.length - 1;
                this.update_line({line_add_num: 1});
            }
                break;
            case "\x1b[B": {
                // 向下
                const index = this.history_line_index + 1;
                if (index < this.history_line.length) {
                    this.line = this.history_line[index];
                    this.history_line_index++;
                }
                this.line_index = this.line.length - 1;
                this.update_line({line_add_num: 1});
            }
                break;
            case "\x1b[C": {
                // 向右
                if (this.line_index >= this.line.length - 1) {
                    break;
                }
                this.line_index++;
                const len = PtyShell.get_full_char_num(this.line[this.line_index]);
                if (this.select_line) {
                    this.update_line({line_add_num: 1});
                    break;
                }
                this.on_call(`\x1b[${len}C`);

            }
                break;
            case "\x1b[D": {
                // 向左
                if (this.line_index === -1) {
                    break;
                }
                const len = PtyShell.get_full_char_num(this.line[this.line_index]);
                this.line_index--;
                if (this.select_line) {
                    this.update_line({line_add_num: 1});
                    break;
                }
                this.on_call(`\x1b[${len}D`);
            }
                break;
            case '\x7F': {
                // 删除左侧 一个字符 backspace
                if (this.select_line) {
                    this.ctrl_exec('\x1b[3~'); // 删除
                    break;
                }
                if (this.line_index === -1) {
                    break;
                }
                this.line = this.removeCharacterAt(this.line, this.line_index);
                this.line_index--;
                this.update_line({line_add_num: 1});
            }
                break;
            case '\x1b[3~': {
                // delete 删除 选中
                if (!this.select_line) {
                    break;
                }
                this.line = this.line.substring(0, this.select_start + 1) + this.line.substring(this.select_end + 1);
                this.line_index = this.select_start;
                this.update_line({line_add_num: 1});
            }
                break;
            case '\x01': {
                // ctrl + a 全选
                this.update_line({all_line_ctrl: `\x1b[48;5;252m${this.line}`,line_add_num:1}); // 一行置灰 235 开始就是灰色 值越大灰度越轻
                this.select_line = this.line;
                this.select_start = -1;
                this.select_end = this.line.length - 1;
                cancel_selected = false;
            }
                break;
            case '\x03': {
                // ctrl + c 复制 或者 结束 子进程
                if (this.select_line && this.copy_handle) {
                    this.copy_handle(this.select_line);
                    this.cancel_selected();
                    this.update_line({line_add_num: 1});
                } else if (this.child) {
                    this.close_child();
                    return;
                }
            }
                break;
            case '\x1b[F': {
                // end
                this.line_index = this.line.length - 1;
                this.update_line({line_add_num: 1});
            }
                break;
            case '\x1b[H': {
                // home
                this.line_index = -1;
                this.update_line({line_add_num: 1});
            }
                break;
            case '\x1b[1;2D': {
                // 按住 shift 向左移动一个字符 目前只能移动一个
                if (this.select_start === -2 || this.select_start === this.line_index) {
                    const index = this.line_index - 1;
                    if (index >= -1) {
                        if (this.select_end === -2) {
                            this.select_end = this.line_index;
                        }
                        // 第一次移动 或者 移动的唯一已经选中 往右移动一次
                        this.line_index = index;
                        this.select_start = index;
                    }
                } else if (this.select_end === this.line_index) {
                    // 之前是往右选中 现在往左退回
                    const index = this.line_index - 1;
                    if (index >= -1) {
                        // 第一次移动 或者 移动的唯一已经选中 往右移动一次
                        this.line_index = index;
                        this.select_end = index;
                    }
                }
                this.select_line = this.line.substring(this.select_start + 1, this.select_end + 1);
                this.update_line({
                    p_line: this.line.substring(0, this.select_start + 1) + `\x1b[48;5;252m${this.select_line}` + cancel_ctrl_value + this.line.substring(this.select_end + 1),
                    line_add_num: 1
                }); // 一行置灰 235 开始就是灰色 值越大灰度越轻
                cancel_selected = false;
            }
                break;
            case '\x1b[1;2C': {
                // 按住 shift  向右移动一个
                if (this.select_end === -2 || this.select_end === this.line_index) {
                    const index = this.line_index + 1;
                    if (index <= this.line.length - 1) {
                        if (this.select_start === -2) {
                            this.select_start = this.line_index;
                        }
                        // 第一次移动 或者 移动的唯一已经选中 往右移动一次
                        this.line_index = index;
                        this.select_end = index;
                    }
                } else if (this.select_start === this.line_index) {
                    const index = this.line_index + 1;
                    // 之前是往左选中 现在往右退回
                    this.line_index = index;
                    this.select_start = index;
                }
                this.select_line = this.line.substring(this.select_start + 1, this.select_end + 1);
                this.update_line({
                    p_line: this.line.substring(0, this.select_start + 1) + `\x1b[48;5;252m${this.select_line}` + cancel_ctrl_value + this.line.substring(this.select_end + 1),
                    line_add_num: 1
                }); // 一行置灰 235 开始就是灰色 值越大灰度越轻
                cancel_selected = false;
            }
                break;
            case '\x1b[1;2H': {
                // shift home
                if (this.select_end === -2) {
                    this.select_end = this.line_index;
                }
                this.select_start = -1;
                this.line_index = -1;
                this.select_line = this.line.substring(this.select_start + 1, this.select_end + 1);
                this.update_line({
                    p_line: this.line.substring(0, this.select_start + 1) + `\x1b[48;5;252m${this.select_line}` + cancel_ctrl_value + this.line.substring(this.select_end + 1),
                    line_add_num: 1
                }); // 一行置灰 235 开始就是灰色 值越大灰度越轻
                cancel_selected = false;
            }
                break;
            case '\x1b[1;2F': {
                // shift end
                if (this.select_start === -2) {
                    this.select_start = this.line_index;
                }
                this.line_index = this.line.length - 1;
                this.select_end = this.line.length - 1;
                this.select_line = this.line.substring(this.select_start + 1, this.select_end + 1);
                this.update_line({
                    p_line: this.line.substring(0, this.select_start + 1) + `\x1b[48;5;252m${this.select_line}` + cancel_ctrl_value + this.line.substring(this.select_end + 1),
                    line_add_num: 1
                }); // 一行置灰 235 开始就是灰色 值越大灰度越轻
                cancel_selected = false;
            }
                break;
            case '\x1b[1;5D': {
                // ctrl 向左
                if (this.line_index === -1) return;
                const h = this.is_empty(this.line[this.line_index]);
                for (let i = this.line_index; i >= 0; i--) {
                    if (this.is_empty(this.line[i]) !== h) {
                        this.line_index = i;
                        break;
                    } else if (i === 0) {
                        this.line_index = -1;
                    }
                }
                this.update_line({line_add_num: 1});
            }
                break;
            case '\x1b[1;5C': {
                // ctrl 向右
                if (this.line_index === this.line.length - 1) return;
                const h = this.is_empty(this.line[this.line_index]);
                const max = this.line.length - 1;
                for (let i = this.line_index; i <= max; i++) {
                    if (this.is_empty(this.line[i]) !== h || i === max) {
                        this.line_index = i;
                        break;
                    }
                }
                this.update_line({line_add_num: 1});
            }
                break;
            // default:{
            //  if(str.startsWith('\x1b')) {
            //      // esc控制信号序列
            //      switch(str[2]) {
            //          case '1':
            //      }
            //  }
            // }
        }
        if (cancel_selected)
            this.cancel_selected();
    }

    private push_history_line(line: string) {
        if (this.history_line[this.history_line.length - 1] === line || !line) {
            this.history_line_index = -1;
            return; // 和最后的一样就不插入了
        }
        this.history_line.push(line);
        if (this.history_line.length > 20) {
            this.history_line.shift(); // 删除最前面的
        }
        this.history_line_index = -1;
    }

    // 解析和执行命令 执行完会自动换行的
    private parse_exec() {
        // const line = this.delete_all_enter(this.line);
        if(!this.line) {
            this.send_and_enter("");
            this.clear_line();
            return;
        }
        this.push_history_line(this.line);
        if (this.child && this.is_pty) {
            // 终端shell 完全 托管给 别的程序
            this.spawn_write(`${this.line}\r`);
            return;
        } else if (this.child) {
            // 把数据给正在运行的别的程序
            this.spawn_write(`${this.line}\n`);
            this.clear_line();
            return;
        }
        const {exe, params} = this.get_exec(this.line);
        try {
            let use_noe_pty = false;
            if (this.check_exe_cmd) {
                // 检查外部自定义的 是否能执行某个命令
                const v = this.check_exe_cmd(exe,params);
                switch (v) {
                    case exec_type.not:
                        this.send_and_enter(`not have permission to execute ${exe}`);
                        this.clear_line();
                        return;
                    case exec_type.auto_child_process:
                        break;
                    case exec_type.not_pty:
                        use_noe_pty = true;
                        break;
                    default:
                        // 未知的不报错也不执行
                           return;
                }
            }
            if (this.cmd_set.has(exe)) {
                // 检测某个已经有预处理的命令 包括用户自定义的
                this.exec_cmd(exe, params);
                this.clear_line();
                return;
            }
            this.spawn(exe, params,use_noe_pty);
            this.clear_line();
        } catch (e) {
            console.log("子线程执行异常", e);
            this.send_and_enter(JSON.stringify(e));
        }
    }

    private multiple_line(data: string, enter_index: number) {
        if (!data) return;
        let num = 0; // 防止解析失败死循环
        while (enter_index > -1 && this.is_running && num < 1000) {
            // 如果有剩余一直插入
            // 不要最后的回车符号
            this.insert_line(data.substring(0, enter_index));
            // 开始解析执行 执行完应该清理行数据
            this.parse_exec();
            // 下一次
            data = data.substring(enter_index + 1);
            enter_index = this.get_enter_index(data);
            num++;
        }
        if (data !== "") {
            // 剩余的还没有换行符
            this.insert_line(data);
        }
    }


    private spawn_write(str: string) {
        if (this.is_pty) {
            this.child.write(str);
        } else {
            this.child.stdin.write(str);
        }
    }

    private spawn(exe: string, params: string[],use_noe_pty = true, spawn_option?: any) {
        if (this.not_use_node_pre_cmd_exec) {
            this.send_and_enter(`not_use_node_pre_cmd_exec is true`);
            return;
        }
        // this.send_and_enter(""); //
        // if (!this.child) {
        //     this.on_call(`\n\r`); // 先换个行
        // }
        if ((use_noe_pty || this.shell_set.has(exe)) && this.node_pty) {
            // if (!exe.includes('exe') && exe !== 'bash' && exe !== 'sh') {
            //     exe += '.exe';
            // }
            this.on_call(`\n\r`); // 先换个行
            this.child = this.node_pty.spawn(exe, params, {
                name: 'xterm-color',
                cols: this.cols,
                rows: this.rows,
                cwd: this.cwd,    // 设置子进程的工作目录
                useConptyDll: false,
                useConpty: process.env.NODE_ENV !== "production" ? false : undefined,// conpty 可以支持 bash 等命令 从 Windows 10 版本 1809 开始提供 ， 但是如果使用了 powershell 这个也就没有必要了，而且设置为false才能使用debug模式运行
                env: {...process.env, ...this.env}, // 传递环境变量
                ...spawn_option
            });
            this.child.onData((data) => {
                this.on_call(data.toString());
            });
            this.child.onExit(({exitCode, signal}) => {
                this.close_child();
                this.send_and_enter(`pty with ${exitCode}`);
                this.next_not_enter = false; // 下一次的换行输出 上一次没有换行
                if (this.on_child_kill_call)
                    this.on_child_kill_call(exitCode);
            })
            this.is_pty = true;
        } else {
            this.is_pty = false;
            // 其他的没有必要再创建一个 tty 都是资源消耗
            this.child = this.node_require.child_process.spawn(exe, params, {
                shell:getShell(),
                cwd: this.cwd,    // 设置子进程的工作目录
                env: {...process.env, ...this.env,LANG: 'en_US.UTF-8'}, // 传递环境变量
                // stdio: 'inherit'  // 让子进程的输入输出与父进程共享 pipe ignore inherit
                // timeout: 5000,      // 设置超时为 5 秒
                maxBuffer: 1024 * 1024 * 10,// 设置缓冲区为 10 MB
                ...spawn_option
            });
            // 设置编码为 'utf8'，确保输出按 UTF-8 编码解析
            this.child.stdout.setEncoding('utf8');
            this.child.stdout.on('data', (data) => {
                const v = data.toString(); // 子程序没有换行等符号不会立即输出 有缓冲区
                this.send_and_enter(v);
            });
            this.child.stderr.on('data', (data) => {
                const v = data.toString();
                this.send_and_enter(v);
                this.next_not_enter = false; // 下一次的换行输出 上一次没有换行
            });
            this.child.on('exit', (code) => {
                this.close_child();
                if (code !== 1) {
                    this.send_and_enter(`process exited with code ${code}`);
                } else {
                    this.send_and_enter(``);
                }
                this.next_not_enter = false; // 下一次的换行输出 上一次没有换行
                if (this.on_child_kill_call)
                    this.on_child_kill_call(code);
            });
            this.child.on('error', (error) => {
                this.next_not_enter = false; // 下一次的换行输出 上一次没有换行
                this.close_child();
                this.send_and_enter(JSON.stringify(error));
            });
        }
    }

    private exec_cmd(exe: string, params: string[]) {
        try {
            const handle = this.cmd_exec_map.get(exe);
            if (exe !== 'cd' && handle) {
                // 如果用户有了就用用户的 不用系统自己的 但是 cd 命令排除在外
                handle(params, (data: string) => {
                    this.send_and_enter(data, true)
                });
                return;
            }
            switch (exe) {
                case 'pwd': {
                    this.send_and_enter(`${this.cwd}`);
                }
                    break;
                case 'cd': {
                    const p = this.node_require.path.isAbsolute(params[0]) ? params[0] : this.node_require.path.join(this.cwd, params[0]);
                    if (!this.node_require.fs.existsSync(p)) {
                        this.send_and_enter(`not directory ${p}`);
                        return;
                    }
                    this.cwd = p;
                    this.send_and_enter(``);
                }
                    break;
                case 'ls': {
                    const items = this.node_require.fs.readdirSync(this.cwd);// 读取目录内容
                    const v = this.cols_handle(" " + items.join("  "));
                    this.send_and_enter(v);
                }
                    break;
                default:
                    this.send_and_enter(`${this.cwd}`);
            }
        } catch (e) {
            this.send_and_enter(JSON.stringify(e));
        }
    }


    private get_exec(str: string) {
        let exe = "", params = [];
        if (!str) {
            return {exe, params};
        }
        let start = -1;
        for (let i = 0; i < str.length; i++) {
            const is_empty = this.is_empty(str[i]);
            if (start === -1 && !is_empty) {
                // 没有开始 且有非空字符
                start = i;
            } else if (start !== -1 && (is_empty || i === str.length - 1)) {
                // 已经开始且遇上空白字符 或者结尾
                const i_p = (i === str.length - 1 && !is_empty) ? str.length : i;
                if (!exe) {
                    exe = str.substring(start, i_p);
                } else {
                    params.push(str.substring(start, i_p));
                }
                start = -1;
            }
        }
        if(start !== -1) {
            params.push(str.substring(start));
        }
        return {exe, params};
    }

    private is_empty(str) {
        // 判断是否为 null 或 undefined
        if (str === null || str === undefined) {
            return true;
        }
        // 判断是否为空字符串或仅包含空白字符（空格、换行符、制表符等）
        return str.trim() === '';
    }

    private get_enter_index(str: string) {
        if (!str) {
            return -1;
        }
        for (let i = 0; i < str.length; i++) {
            if (str[i] == '\r') {
                return i;
            }
        }
        return -1;
    }

    // 将 \r 替换成 \n\r
    private get_enter_line(str: string, index: number) {
        if (!str) {
            return str;
        }
        return str.substring(0, index) + '\n\r';
    }

    // 删除自定义位置的字符
    private removeCharacterAt(str, index) {
        let arr = str.split('');
        arr.splice(index, 1);  // 删除指定位置的字符
        return arr.join('');
    }


    // 删除所有换行符号
    private delete_all_enter(str: string) {
        if (!str) {
            return str;
        }
        const arr = str.split('');
        return arr.filter(v => v !== '\r' && v !== '\n').join('');
    }

}