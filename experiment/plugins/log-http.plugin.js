/**
 * 示例插件 - 日志与 HTTP 请求监听
 *
 * 演示插件系统的两个回调：
 *   on_log(level, args)  —— 项目里所有 console.log/info/warn/error/debug 都会回调
 *   on_http(info)        —— 每个 HTTP 请求处理完成后回调（带登录用户信息）
 *
 * 安装方法：
 *   在 FileCat「设置 -> 插件配置」中添加一条：
 *     - 名称: 日志与请求监听
 *     - 路径: <本文件绝对路径>
 *     - 开启: 是
 *   保存后会立即加载。
 *
 * 本 demo 把收集到的日志和请求写入 <filecat数据目录>/plugin-log-http/ 目录下：
 *   - log.log   每行一条日志
 *   - http.log  每行一条请求
 * 方便直接看效果；实际使用时可以改成上报到自己的服务、写入数据库等。
 */

const fs = require('fs');
const path = require('path');

// ---- 可修改的配置区 ----
const OPTIONS = {
    // 是否把日志写入文件
    save_log: true,
    // 是否把 HTTP 请求写入文件
    save_http: true,
    // 只记录这些级别的日志；留空表示全部级别
    // 可选: 'log' | 'info' | 'warn' | 'error' | 'debug'
    log_levels: [],
    // 忽略这些路径前缀的 HTTP 请求（例如静态资源、心跳）
    http_ignore_prefix: ['/api/sys/ws'],
    // 控制台是否也打印一份（调试用）
    print_console: false,
};
// ------------------------

// 输出目录（延迟到 activate 时才知道 work_dir）
let out_dir = '';
let log_file = '';
let http_file = '';

/** 把一行文本追加到文件（出错不抛出，避免影响主流程） */
function append_line(file, line) {
    try {
        fs.appendFileSync(file, line + '\n');
    } catch (e) {
        // 写文件失败时只在控制台提示，不能让主流程报错
        console.error('[log-http plugin] 写文件失败:', e.message);
    }
}

/** 把 console 的参数格式化成一个字符串 */
function format_args(args) {
    return args
        .map((v) => {
            if (typeof v === 'string') return v;
            if (v instanceof Error) return v.stack || v.message;
            try {
                return JSON.stringify(v);
            } catch (e) {
                return String(v);
            }
        })
        .join(' ');
}

const filecat_plugin = {
    meta: {
        id: 'log-http-listener',
        name: '日志与请求监听插件',
        version: '1.0.0',
        description: '监听项目全部日志输出与 HTTP 请求，可落盘或上报',
        author: 'filecat',
    },

    activate(context) {
        out_dir = path.join(context.env.work_dir, 'plugin-log-http');
        try {
            fs.mkdirSync(out_dir, {recursive: true});
        } catch (e) {
            console.error('[log-http plugin] 创建目录失败:', e.message);
        }
        log_file = path.join(out_dir, 'log.log');
        http_file = path.join(out_dir, 'http.log');
        console.log(`[log-http plugin] 已激活，输出目录: ${out_dir}`);
    },

    deactivate() {
        console.log('[log-http plugin] 已停用');
    },

    /**
     * 日志回调：项目里每次 console.xxx 都会调用。
     * @param level 'log' | 'info' | 'warn' | 'error' | 'debug'
     * @param args  原始参数
     */
    on_log(level, args) {
        if (OPTIONS.log_levels.length > 0 && !OPTIONS.log_levels.includes(level)) {
            return;
        }
        const text = `[${new Date().toISOString()}][${level}] ${format_args(args)}`;
        if (OPTIONS.print_console) {
            console.log('[plugin on_log]', text);
        }
        if (OPTIONS.save_log && log_file) {
            append_line(log_file, text);
        }
    },

    /**
     * HTTP 请求回调：请求处理完成后调用。
     * @param info { method, url, path, ip, headers, status, duration, user }
     *   info.user 是登录用户的安全信息（username / user_id / id 等），未登录为 null
     */
    on_http(info) {
        if (OPTIONS.http_ignore_prefix.some((p) => info.path.startsWith(p))) {
            return;
        }
        const user = info.user
            ? `${info.user.username}(id=${info.user.id})`
            : '未登录';
        const text = `[${new Date().toISOString()}] ${info.method} ${info.url} `
            + `status=${info.status} ${info.duration}ms ip=${info.ip} user=${user}`;
        if (OPTIONS.print_console) {
            console.log('[plugin on_http]', text);
        }
        if (OPTIONS.save_http && http_file) {
            append_line(http_file, text);
        }
    },
};

module.exports = { filecat_plugin };
