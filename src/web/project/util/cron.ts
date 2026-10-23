/**
 * cron 表达式的解析 / 生成 / 校验 / 自然语言描述。
 *
 * 格式与后端 setting.service.ts 的 isValidCron 完全一致：
 *   秒 分 时 日 月 星期（共 6 段，node-cron 格式）
 * 每段只支持四种写法：*  、 * /n  、 n-m  、 n,m
 * 不支持 L、W、?、# 等扩展语法，因此这里也不做支持。
 */

/** 6 个字段的定义：取值范围与名称 */
export const CRON_FIELDS = [
    {key: "second", min: 0, max: 59, label: "秒"},
    {key: "minute", min: 0, max: 59, label: "分"},
    {key: "hour", min: 0, max: 23, label: "时"},
    {key: "day", min: 1, max: 31, label: "日"},
    {key: "month", min: 1, max: 12, label: "月"},
    {key: "week", min: 0, max: 7, label: "星期"},
] as const;

export type cron_field_key = typeof CRON_FIELDS[number]["key"];

/** 单段的结构化表示 */
export interface cron_field {
    /** 模式：every 任意值 / step 每隔 n / range 从 a 到 b / list 指定多个具体值 */
    mode: "every" | "step" | "range" | "list";
    /** step 模式下的步长 */
    step?: number;
    /** range 模式下的起止 */
    from?: number;
    to?: number;
    /** list 模式下的具体值 */
    values?: number[];
}

export interface cron_value {
    second: cron_field;
    minute: cron_field;
    hour: cron_field;
    day: cron_field;
    month: cron_field;
    week: cron_field;
}

/** 单段默认值：全部为任意 */
export const CRON_DEFAULT_FIELD: cron_field = {mode: "every"};

/** 整个表达式的默认值：每天的 0 点 0 分 0 秒 */
export function cron_default_value(): cron_value {
    return {
        second: {mode: "every"},
        minute: {mode: "every"},
        hour: {mode: "every"},
        day: {mode: "every"},
        month: {mode: "every"},
        week: {mode: "every"},
    };
}

/** 把单段结构转成字符串 */
export function cron_field_to_str(field: cron_field): string {
    switch (field.mode) {
        case "step":
            return `*/${field.step ?? 1}`;
        case "range":
            return `${field.from ?? 0}-${field.to ?? 0}`;
        case "list":
            return (field.values ?? []).join(",");
        default:
            return "*";
    }
}

/** 把结构化值转成 cron 表达式（6 段） */
export function cron_to_str(value: cron_value): string {
    return [
        cron_field_to_str(value.second),
        cron_field_to_str(value.minute),
        cron_field_to_str(value.hour),
        cron_field_to_str(value.day),
        cron_field_to_str(value.month),
        cron_field_to_str(value.week),
    ].join(" ");
}

/**
 * 解析单段字符串。
 * 解析不出（含非法写法）时返回 null，由调用方决定回退策略。
 */
export function parse_cron_field(text: string, min: number, max: number): cron_field | null {
    const s = (text ?? "").trim();
    if (!s) return null;
    if (s === "*") return {mode: "every"};

    // */n
    if (s.startsWith("*/")) {
        const step = Number(s.slice(2));
        if (!Number.isInteger(step) || step <= 0) return null;
        return {mode: "step", step};
    }

    // n-m
    if (s.includes("-") && !s.includes(",")) {
        const [a, b] = s.split("-").map(Number);
        if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
        if (a < min || b > max || a > b) return null;
        return {mode: "range", from: a, to: b};
    }

    // n,m 或单个 n
    const parts = s.split(",");
    const values: number[] = [];
    for (const part of parts) {
        const n = Number(part.trim());
        if (!Number.isInteger(n) || n < min || n > max) return null;
        values.push(n);
    }
    if (values.length === 0) return null;
    return {mode: "list", values};
}

/**
 * 解析完整表达式。
 * 段数不对或任一段非法都返回 null，调用方据此判断"是否需要回退到默认值"。
 */
export function parse_cron(expr: string): cron_value | null {
    const parts = (expr ?? "").trim().split(/\s+/);
    if (parts.length !== 6) return null;
    const result = {} as cron_value;
    for (let i = 0; i < 6; i++) {
        const def = CRON_FIELDS[i];
        const field = parse_cron_field(parts[i], def.min, def.max);
        if (!field) return null;
        result[def.key] = field;
    }
    return result;
}

/**
 * 与后端 isValidCron 等价的校验。
 * 前端只用来给输入框提示，真正的拦截仍由后端负责。
 */
export function is_valid_cron(expr: string): boolean {
    return parse_cron(expr) !== null;
}

/** 补零，用于把 0-59 这类数值排成两位数便于阅读 */
function pad(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}

/**
 * 把一段生成"每 X"这样的中文描述片段。
 * 返回 null 表示这一段是"任意"，不需要出现在描述里。
 */
function describe_field(field: cron_field, unit: string, min: number): string | null {
    switch (field.mode) {
        case "step":
            return `每 ${field.step} ${unit}`;
        case "range":
            return `${field.from} 到 ${field.to} ${unit}`;
        case "list": {
            const vals = (field.values ?? []).slice().sort((a, b) => a - b);
            return `${vals.join("、")} ${unit}`;
        }
        default:
            return null;
    }
}

/**
 * 生成人类可读的表达式描述，供输入框下方展示。
 * 只覆盖常见组合，不符合的组合退化成"每 X"式描述，不硬凑语义。
 */
export function describe_cron(value: cron_value): string {
    const {second, minute, hour, day, month, week} = value;

    /** 某段是否只指定了一个值，且该值为 n */
    const only = (f: cron_field, n: number) =>
        f.mode === "list" && (f.values ?? []).length === 1 && f.values![0] === n;

    const parts: string[] = [];

    // ---- 时间部分（时 / 分 / 秒）----
    // 常见：秒与分都固定单值
    if (hour.mode === "list" && minute.mode === "list" && only(second, 0)) {
        const hs = (hour.values ?? []).slice().sort((a, b) => a - b);
        const ms = (minute.values ?? []).slice().sort((a, b) => a - b);
        // 时分一一对应时用 HH:MM，多值交叉时列出所有组合
        if (hs.length === ms.length && hs.length > 1 && ms.length > 1) {
            parts.push(hs.map((h, i) => `${pad(h)}:${pad(ms[i])}`).join("、"));
        } else if (hs.length === 1 && ms.length === 1) {
            parts.push(`${pad(hs[0])}:${pad(ms[0])}`);
        } else {
            // 时多值 + 分单值（或反之）时逐段描述更清楚
            parts.push(`${hs.map(pad).join("、")} 时 ${ms.join("、")} 分`);
        }
    } else if (hour.mode === "list" && minute.mode === "step" && only(second, 0)) {
        parts.push(`${(hour.values ?? []).map(pad).join("、")} 时内每 ${minute.step} 分钟`);
    } else if (hour.mode === "every" && minute.mode === "list" && only(second, 0)) {
        parts.push(`每小时的 ${(minute.values ?? []).join("、")} 分`);
    } else if (hour.mode === "every" && minute.mode === "step" && only(second, 0)) {
        parts.push(`每 ${minute.step} 分钟`);
    } else if (hour.mode === "every" && minute.mode === "every" && only(second, 0)) {
        parts.push("每分钟");
    } else if (hour.mode === "every" && minute.mode === "every" && second.mode === "step") {
        parts.push(`每 ${second.step} 秒`);
    } else if (hour.mode === "every" && minute.mode === "every" && second.mode === "every") {
        parts.push("每秒");
    } else if (hour.mode === "every" && minute.mode === "every" && second.mode === "list") {
        parts.push(`每分钟的第 ${(second.values ?? []).join("、")} 秒`);
    } else {
        // 其它组合逐段拼接，不做语义猜测；
        // 秒是 0 时不单独提"0 秒"，避免出现"0 时 0 分 0 秒"这类冗余描述
        const segs: string[] = [];
        const h = describe_field(hour, "时", 0);
        const m = describe_field(minute, "分", 0);
        const s = only(second, 0) ? null : describe_field(second, "秒", 0);
        if (h) segs.push(h);
        if (m) segs.push(m);
        if (s) segs.push(s);
        if (segs.length > 0) parts.push(segs.join(" "));
    }

    // ---- 日期部分（日 / 月 / 星期）----
    // 这三段都用「仅指定单值」表达成更自然的说法
    const dayOne = day.mode === "list" && (day.values ?? []).length === 1 ? day.values![0] : null;
    const monthOne = month.mode === "list" && (month.values ?? []).length === 1 ? month.values![0] : null;
    const weekOne = week.mode === "list" && (week.values ?? []).length === 1 ? week.values![0] : null;

    const week_names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六", "周日"];

    let dateDesc = "";
    if (monthOne !== null && dayOne !== null) {
        dateDesc = `每年 ${monthOne} 月 ${dayOne} 号`;
    } else if (monthOne !== null) {
        dateDesc = `每年 ${monthOne} 月`;
    } else if (dayOne !== null) {
        dateDesc = `每月 ${dayOne} 号`;
    } else if (weekOne !== null) {
        dateDesc = `每${week_names[weekOne] ?? `星期 ${weekOne}`}`;
    } else {
        // 区间 / 步长 / 多值的情况按段描述
        const segs: string[] = [];
        if (month.mode !== "every") segs.push(describe_field(month, "月", 1)!);
        if (day.mode !== "every") segs.push(describe_field(day, "号", 1)!);
        if (week.mode !== "every") segs.push(`星期 ${describe_field(week, "", 0)!}`);
        if (segs.length) dateDesc = segs.join(" ");
    }

    // 既没指定日期也没指定星期，表示"每天"
    if (!dateDesc) dateDesc = "每天";

    // 时间描述本身已经含"每 X"语义时，不再前置"每天"
    const timeDesc = parts.join("，");
    const alreadyEvery = /^(每|每天)/.test(timeDesc);
    return alreadyEvery ? `${timeDesc}${dateDesc === "每天" ? "" : "，" + dateDesc} 执行`
        : `${dateDesc} ${timeDesc} 执行`;
}
