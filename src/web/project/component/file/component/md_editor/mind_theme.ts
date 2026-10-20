/**
 * simple-mind-map 的补充主题。
 *
 * 库本身只内置了 default 一套主题（官方在线 demo 的其它主题写在它自己的
 * web 工程里，不在 npm 包内），所以这里补几套常用的，让编辑器能切风格。
 *
 * 注册方式：MindMap.defineTheme(name, config)，之后 setTheme(name) 即可。
 */

export type MindThemeConfig = {
    backgroundColor?: string;
    backgroundImage?: string;
    lineColor?: string;
    lineWidth?: number;
    lineDasharray?: string;
    lineStyle?: string;
    root?: Record<string, any>;
    second?: Record<string, any>;
    node?: Record<string, any>;
    generalization?: Record<string, any>;
};

/** 主题名 -> 配置。key 必须与 MIND_THEMES 里的 value 对应 */
export const MIND_THEME_MAP: Record<string, MindThemeConfig> = {
    // 经典：白底绿线，接近 XMind 的默认观感
    classic: {
        backgroundColor: "#fafafa",
        lineColor: "#4d8f7f",
        lineWidth: 2,
        root: {
            fillColor: "#4d8f7f",
            color: "#fff",
            borderRadius: 6,
            paddingX: 18,
            paddingY: 8,
        },
        second: {
            fillColor: "#fff",
            color: "#2f4f47",
            borderRadius: 5,
            borderColor: "#4d8f7f",
            borderWidth: 1,
            paddingX: 14,
            paddingY: 6,
        },
        node: {
            fillColor: "#fff",
            color: "#3c3c3c",
            borderRadius: 5,
            borderColor: "#a8d5c8",
            borderWidth: 1,
            paddingX: 12,
            paddingY: 5,
        },
    },
    // 暗色：深底浅字
    dark: {
        backgroundColor: "#1f2226",
        lineColor: "#6b7c8c",
        lineWidth: 1,
        root: {
            fillColor: "#3a4654",
            color: "#f2f4f6",
            borderRadius: 6,
            paddingX: 18,
            paddingY: 8,
        },
        second: {
            fillColor: "#2b323a",
            color: "#e6eaef",
            borderRadius: 5,
            borderColor: "#4c5866",
            borderWidth: 1,
            paddingX: 14,
            paddingY: 6,
        },
        node: {
            fillColor: "#242a31",
            color: "#ccd3da",
            borderRadius: 5,
            borderColor: "#3c454f",
            borderWidth: 1,
            paddingX: 12,
            paddingY: 5,
        },
    },
    // 极简：去边框，只靠文字与细线层级
    simple: {
        backgroundColor: "#fff",
        lineColor: "#c8ccd0",
        lineWidth: 1,
        root: {
            fillColor: "transparent",
            color: "#202124",
            borderRadius: 0,
            borderWidth: 0,
            paddingX: 10,
            paddingY: 4,
        },
        second: {
            fillColor: "transparent",
            color: "#202124",
            borderRadius: 0,
            borderWidth: 0,
            paddingX: 8,
            paddingY: 3,
        },
        node: {
            fillColor: "transparent",
            color: "#5f6368",
            borderRadius: 0,
            borderWidth: 0,
            paddingX: 8,
            paddingY: 3,
        },
    },
    // 缤纷：分层配色，适合演示
    colorful: {
        backgroundColor: "#fffdf6",
        lineColor: "#f2a65a",
        lineWidth: 2,
        root: {
            fillColor: "#f2854a",
            color: "#fff",
            borderRadius: 24,
            paddingX: 20,
            paddingY: 9,
        },
        second: {
            fillColor: "#ffd66b",
            color: "#6b4a12",
            borderRadius: 16,
            borderWidth: 0,
            paddingX: 14,
            paddingY: 6,
        },
        node: {
            fillColor: "#a8d8ea",
            color: "#1e3f4d",
            borderRadius: 12,
            borderWidth: 0,
            paddingX: 12,
            paddingY: 5,
        },
    },
};

/** 把自定义主题注册到已加载的 MindMap 构造器（重复调用无副作用） */
export function register_mind_themes(MindMap: any) {
    Object.entries(MIND_THEME_MAP).forEach(([name, config]) => {
        // defineTheme 存在才注册，避免不同版本 API 差异导致直接抛错
        MindMap.defineTheme?.(name, config);
    });
}
