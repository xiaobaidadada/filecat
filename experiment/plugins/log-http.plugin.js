
const fs = require('fs');
const path = require('path');

// ---- 可修改的配置区 ----
const LOG_DIR = '/temp';
const RETENTION_DAYS = 7; // 保留天数
// ------------------------

function get_log_file() {
    const date = new Date().toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Shanghai',
    });
    return path.join(LOG_DIR, `filecat操作日志-${date}.log`);
}

function clean_old_logs() {
    const expire_time = Date.now() - RETENTION_DAYS * 86400000;

    try {
        for (const file of fs.readdirSync(LOG_DIR)) {
            const match = file.match(/^filecat操作日志-(\d{4}-\d{2}-\d{2})\.log$/);
            if (!match) continue;

            const file_time = new Date(`${match[1]}T00:00:00+08:00`).getTime();
            if (file_time < expire_time) {
                fs.unlinkSync(path.join(LOG_DIR, file));
            }
        }
    } catch {}
}

function append_line(line) {
    try {
        fs.appendFileSync(get_log_file(), line + '\n');
    } catch {}
}

function format_args(args) {
    return args.map(v => {
        if (typeof v === 'string') return v;
        if (v instanceof Error) return v.stack || v.message;
        try {
            return JSON.stringify(v) ?? String(v);
        } catch {
            return String(v);
        }
    }).join(' ');
}

// 安全地把对象转成单行 JSON，循环引用等异常时退化为 String
function to_json(v) {
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

// 敏感请求头脱敏，避免把凭据写进日志
function mask_headers(headers) {
    if (!headers || typeof headers !== 'object') return headers;
    const masked = { ...headers };
    const secret_keys = ['authorization', 'cookie', 'proxy-authorization', 'x-api-key'];
    for (const key of Object.keys(masked)) {
        if (secret_keys.includes(key.toLowerCase())) {
            masked[key] = '***';
        }
    }
    return masked;
}

const filecat_plugin = {
    meta: {
        id: 'log-http-listener',
        name: '日志与请求监听插件',
        version: '1.0.0',
        description: '按天记录项目日志与 HTTP 请求，并自动清理过期日志',
        author: 'ok1',
    },

    activate() {
        try {
            fs.mkdirSync(LOG_DIR, { recursive: true });
            clean_old_logs();
        } catch {}
    },

    deactivate() {},

    on_log(level, args) {
        append_line(`[${new Date().toISOString()}][${level}] ${format_args(args)}`);
    },

    on_http(info) {
        const user = info.user
            ? `${info.user.username}(id=${info.user.id})`
            : '未登录';

        const lines = [];
        // 概要行
        lines.push(
            `[${new Date().toISOString()}][HTTP] ${info.method} ${info.url} `
            + `status=${info.status} ${info.duration}ms ip=${info.ip} user=${user}`
        );
        // 请求行：协议/主机/HTTP 版本/查询串
        lines.push(
            `   请求: protocol=${info.protocol || '-'} hostname=${info.hostname || '-'} `
            + `httpVersion=${info.httpVersion || '-'} search=${info.search || '-'}`
        );
        // UA 与 Referer
        lines.push(`   UA: ${info.req?.headers?.['user-agent'] || '-'}`);
        lines.push(`   Referer: ${info.req?.headers?.['referer'] || '-'}`);
        // 请求头（脱敏）
        lines.push(`   请求头: ${to_json(mask_headers(info.headers))}`);
        // 查询参数与路由参数
        lines.push(`   查询参数: ${to_json(info.query ?? {})}`);
        lines.push(`   路由参数: ${to_json(info.params ?? {})}`);
        // 请求体（POST/PUT）
        if (info.method !== 'GET' && info.method !== 'HEAD') {
            lines.push(`   请求体: ${to_json(info.body ?? {})}`);
        }
        // 响应头
        let res_headers;
        try {
            res_headers = info.res?.getHeaders ? info.res.getHeaders() : undefined;
        } catch {}
        lines.push(`   响应头: ${to_json(res_headers ?? {})}`);

        append_line(lines.join('\n'));
    },
};

module.exports = { filecat_plugin };
