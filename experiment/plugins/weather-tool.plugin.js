/**
 * 示例 AI Tool 插件 - 多功能工具包
 * 
 * 这个插件展示了如何在一个插件中提供多个 AI 工具。
 * 包含：天气查询、单位换算、时间日期工具
 * 
 * 安装方法：
 * 1. 在 FileCat 设置 -> 插件配置 中添加：
 *    - 名称: 多功能工具包
 *    - 路径: /path/to/weather-tool.plugin.js
 *    - 开启: 是
 * 2. 保存后，AI Agent 将会自动使用该插件的所有工具
 */

// ===== 工具1: 天气查询 =====
const get_weather_handler = async (args) => {
    const { city, date } = args;
    const weatherData = {
        city: city,
        date: date || new Date().toLocaleDateString("zh-CN"),
        temperature: Math.floor(Math.random() * 35) + 5,
        humidity: Math.floor(Math.random() * 60) + 30,
        condition: ["☀️ 晴天", "⛅ 多云", "☁️ 阴天", "🌦️ 小雨", "🌧️ 中雨", "🌬️ 大风"][Math.floor(Math.random() * 6)],
        wind_speed: Math.floor(Math.random() * 20) + 1,
        uv_index: Math.floor(Math.random() * 11),
        update_time: new Date().toLocaleString("zh-CN")
    };
    return JSON.stringify(weatherData, null, 2);
};

// ===== 工具2: 单位换算 =====
const unit_convert_handler = async (args) => {
    const { value, from_unit, to_unit, category } = args;
    
    // 长度换算表（基准：米）
    const lengthUnits = {
        'mm': 0.001, 'cm': 0.01, 'm': 1, 'km': 1000,
        'inch': 0.0254, 'ft': 0.3048, 'yard': 0.9144, 'mile': 1609.344
    };
    // 重量换算表（基准：千克）
    const weightUnits = {
        'mg': 0.000001, 'g': 0.001, 'kg': 1, 't': 1000,
        'oz': 0.0283495, 'lb': 0.453592, 'stone': 6.35029
    };
    // 温度特殊处理
    const tempUnits = ['c', 'f', 'k'];

    let result;
    if (category === 'temperature') {
        // 温度换算
        let celsius;
        if (from_unit === 'c') celsius = value;
        else if (from_unit === 'f') celsius = (value - 32) * 5 / 9;
        else if (from_unit === 'k') celsius = value - 273.15;
        else throw new Error(`不支持的温度单位: ${from_unit}`);

        if (to_unit === 'c') result = celsius;
        else if (to_unit === 'f') result = celsius * 9 / 5 + 32;
        else if (to_unit === 'k') result = celsius + 273.15;
        else throw new Error(`不支持的温度单位: ${to_unit}`);
    } else if (category === 'length') {
        const fromFactor = lengthUnits[from_unit];
        const toFactor = lengthUnits[to_unit];
        if (!fromFactor || !toFactor) throw new Error(`不支持的长度单位: ${from_unit} 或 ${to_unit}`);
        result = (value * fromFactor) / toFactor;
    } else if (category === 'weight') {
        const fromFactor = weightUnits[from_unit];
        const toFactor = weightUnits[to_unit];
        if (!fromFactor || !toFactor) throw new Error(`不支持的重量单位: ${from_unit} 或 ${to_unit}`);
        result = (value * fromFactor) / toFactor;
    } else {
        throw new Error(`不支持的换算类别: ${category}，支持: temperature, length, weight`);
    }

    return JSON.stringify({
        value: value,
        from: `${value} ${from_unit}`,
        to: `${parseFloat(result.toFixed(6))} ${to_unit}`,
        category: category,
        formula: category === 'temperature' ? '已应用温度换算公式' : `${from_unit} → ${to_unit} (×${(1 / (from_unit === 'm' ? 1 : lengthUnits[from_unit] || weightUnits[from_unit]))?.toFixed(4) || 'N/A'})`
    }, null, 2);
};

// ===== 工具3: 时间日期工具 =====
const datetime_tool_handler = async (args) => {
    const { action, timezone, date_str, days_offset } = args;
    const now = new Date();

    const getTimeInZone = (tz) => {
        const utc = now.getTime() + now.getTimezoneOffset() * 60000;
        const offsets = {
            'UTC': 0, 'GMT': 0,
            'CST': 8, 'Asia/Shanghai': 8, '北京时间': 8,
            'JST': 9, 'Asia/Tokyo': 9, '东京': 9,
            'EST': -5, 'America/New_York': -5, '纽约': -5,
            'PST': -8, 'America/Los_Angeles': -8, '洛杉矶': -8,
            'BST': 1, 'Europe/London': 1, '伦敦': 1,
            'CET': 1, 'Europe/Berlin': 1, '柏林': 1,
            'IST': 5.5, 'Asia/Kolkata': 5.5,
            'AEST': 10, 'Australia/Sydney': 10, '悉尼': 10,
        };
        const offset = offsets[tz];
        if (offset === undefined) throw new Error(`不支持时区: ${tz}`);
        return new Date(utc + offset * 3600000);
    };

    switch (action) {
        case 'now': {
            const targetTime = timezone ? getTimeInZone(timezone) : now;
            return JSON.stringify({
                action: '当前时间',
                timezone: timezone || '本地时区',
                datetime: targetTime.toLocaleString('zh-CN'),
                iso: targetTime.toISOString(),
                timestamp: targetTime.getTime(),
                weekday: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][targetTime.getDay()],
                is_leap_year: (targetTime.getFullYear() % 4 === 0 && targetTime.getFullYear() % 100 !== 0) || targetTime.getFullYear() % 400 === 0
            }, null, 2);
        }
        case 'calculate_offset': {
            const offset = days_offset || 0;
            const target = new Date(now);
            target.setDate(target.getDate() + offset);
            return JSON.stringify({
                action: offset >= 0 ? `${offset}天后` : `${Math.abs(offset)}天前`,
                date: target.toLocaleDateString('zh-CN'),
                weekday: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][target.getDay()],
                diff_days: offset
            }, null, 2);
        }
        case 'parse_date': {
            if (!date_str) throw new Error('请提供 date_str 参数');
            const d = new Date(date_str);
            if (isNaN(d.getTime())) throw new Error(`无法解析日期: ${date_str}`);
            const diff = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return JSON.stringify({
                parsed_date: d.toLocaleDateString('zh-CN'),
                weekday: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][d.getDay()],
                iso: d.toISOString(),
                timestamp: d.getTime(),
                diff_from_today: `${diff > 0 ? '还有' : diff < 0 ? '已过' : '就是今天'}${diff !== 0 ? Math.abs(diff) + '天' : ''}`
            }, null, 2);
        }
        default:
            throw new Error(`不支持的操作: ${action}，支持: now, calculate_offset, parse_date`);
    }
};

// ===== 插件导出 =====
const filecat_plugin = {
    meta: {
        id: "multi-tool-pack",
        name: "多功能工具包",
        version: "1.0.0",
        type: "ai_tool",
        description: "提供天气查询、单位换算、时间日期处理等实用工具，一个插件包含多个 AI 工具函数",
        author: "filecat"
    },

    // ==========================================
    // 一个插件可以提供多个 tools！
    // 数组中的每个元素都是一个完整的工具
    // ==========================================
    tools: [
        // ---- 工具1: 天气查询 ----
        {
            schema: {
                type: "function",
                function: {
                    name: "get_weather",
                    description: "获取指定城市的天气信息，包括温度、湿度、天气状况、紫外线指数等",
                    parameters: {
                        type: "object",
                        properties: {
                            city: {
                                type: "string",
                                description: "城市名称，例如 北京、上海、广州、New York"
                            },
                            date: {
                                type: "string",
                                description: "日期，可选，格式 YYYY-MM-DD，默认今天"
                            }
                        },
                        required: ["city"]
                    }
                }
            },
            handler: get_weather_handler
        },

        // ---- 工具2: 单位换算 ----
        {
            schema: {
                type: "function",
                function: {
                    name: "unit_convert",
                    description: "单位换算，支持长度(mm/cm/m/km/inch/ft)、重量(g/kg/lb/oz)、温度(C/F/K)等类别的单位转换",
                    parameters: {
                        type: "object",
                        properties: {
                            value: {
                                type: "number",
                                description: "要转换的数值"
                            },
                            from_unit: {
                                type: "string",
                                description: "源单位，长度: mm/cm/m/km/inch/ft，重量: g/kg/lb/oz/t，温度: c/f/k"
                            },
                            to_unit: {
                                type: "string",
                                description: "目标单位，同上"
                            },
                            category: {
                                type: "string",
                                enum: ["length", "weight", "temperature"],
                                description: "换算类别: length(长度), weight(重量), temperature(温度)"
                            }
                        },
                        required: ["value", "from_unit", "to_unit", "category"]
                    }
                }
            },
            handler: unit_convert_handler
        },

        // ---- 工具3: 时间日期工具 ----
        {
            schema: {
                type: "function",
                function: {
                    name: "datetime_tool",
                    description: "时间日期工具，可获取当前时间(支持时区)、计算N天前后的日期、解析任意日期字符串",
                    parameters: {
                        type: "object",
                        properties: {
                            action: {
                                type: "string",
                                enum: ["now", "calculate_offset", "parse_date"],
                                description: "操作类型: now(当前时间), calculate_offset(偏移计算), parse_date(日期解析)"
                            },
                            timezone: {
                                type: "string",
                                description: "时区(可选)，如 UTC/CST/Asia/Shanghai/JST/EST/PST 等，仅 action=now 时使用"
                            },
                            date_str: {
                                type: "string",
                                description: "日期字符串，仅 action=parse_date 时使用，如 2024-12-25 或 next Friday"
                            },
                            days_offset: {
                                type: "number",
                                description: "天数偏移，仅 action=calculate_offset 时使用，正数未来、负数过去"
                            }
                        },
                        required: ["action"]
                    }
                }
            },
            handler: datetime_tool_handler
        }
    ],

    activate(context) {
        console.log(`[MultiTool Plugin] ✅ 已激活，共 ${this.tools.length} 个工具`);
        console.log(`[MultiTool Plugin] 📦 工具列表: ${this.tools.map(t => t.schema.function.name).join(', ')}`);
        console.log(`[MultiTool Plugin] ⚙️  工作目录: ${context.env.work_dir}`);
        if (Object.keys(context.params).length > 0) {
            console.log(`[MultiTool Plugin] 🔧 插件参数:`, JSON.stringify(context.params));
        }
    },

    deactivate() {
        console.log("[MultiTool Plugin] 🔌 已停用");
    }
};

module.exports = { filecat_plugin };
