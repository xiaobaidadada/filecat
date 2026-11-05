import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from "./i18/zh-CH.json";

/**
 * 各语言的语言包用动态 import 拆成独立 chunk，只有切到该语言时才下载。
 * 中文是兜底语言，直接打进主包，保证任何时候都能立即渲染。
 */
const LAZY_LOADERS = {
    de: () => import("./i18/de.json"),
    ja: () => import("./i18/ja.json"),
    ko: () => import("./i18/ko.json"),
    ru: () => import("./i18/ru.json"),
    fr: () => import("./i18/fr.json"),
    es: () => import("./i18/es.json"),
    en: () => import("./i18/en.json"),
};

/** 支持的语言，用于把 en-US / zh-CN 这类取值归到 en / zh */
const SUPPORTED = ["zh", "en", "de", "ja", "ko", "ru", "fr", "es"];

/**
 * 归一化语言标识，例如 zh-CN -> zh、en-US -> en。
 * 取不到支持的语言时返回 null，由调用方决定兜底。
 */
export function normalize_lang(lang) {
    if (!lang || typeof lang !== "string") {
        return null;
    }
    const lower = lang.toLowerCase().replace("_", "-");
    if (lower === "zh-ch") {
        return "zh";
    }
    const main = lower.split("-")[0];
    return SUPPORTED.includes(main) ? main : null;
}

/**
 * 读取用户设置的语言；未登录或未设置时退回浏览器语言，再退回中文。
 */
function read_now_lang() {
    let lang = null;
    try {
        const data = localStorage.getItem("user_base_info");
        if (data) {
            lang = JSON.parse(data)?.user_data?.language;
        }
    } catch (e) {
    }
    if (!lang || lang === "sys") {
        lang = navigator.language;
    }
    return normalize_lang(lang) ?? "zh";
}

/**
 * 加载指定语言的资源包；中文已打包在内存里，直接返回。
 * 用 i18next 的 addResourceBundle 注册，之后 changeLanguage 就是同步且立即生效。
 */
async function load_lang(lang) {
    const key = normalize_lang(lang) ?? "zh";
    if (key === "zh" || i18n.hasResourceBundle(key, "translation")) {
        return;
    }
    const loader = LAZY_LOADERS[key];
    if (!loader) {
        return;
    }
    const mod = await loader();
    i18n.addResourceBundle(key, "translation", mod.default ?? mod, true, true);
}

const now_lang = read_now_lang();

i18n
    // 将 i18n 实例传递给 react-i18next
    .use(initReactI18next)
    // 初始化 i18next
    // 所有配置选项: https://www.i18next.com/overview/configuration-options
    .init({
        resources: {
            zh: {
                translation: zh // 中文
            }
        },
        fallbackLng: "zh",
        lng: now_lang,
        // 资源是异步补齐的，关掉后切语言立即生效
        initImmediate: false,
        // debug: true,
        interpolation: {
            escapeValue: false, // not needed for react as it escapes by default
        }
    });

// 首屏语言不是中文时补加载一次，加载完成后 changeLanguage 会触发界面刷新
if (now_lang !== "zh") {
    load_lang(now_lang).then(() => {
        if (i18n.language !== now_lang) {
            return;
        }
        // 资源就绪后重新渲染一次，替换掉加载期间显示的兜底文案
        i18n.changeLanguage(now_lang);
    });
}

/**
 * 切换语言：先加载对应语言包再切换，保证不会出现残留的兜底文案。
 */
export async function change_lang(lang) {
    await load_lang(lang);
    return i18n.changeLanguage(normalize_lang(lang) ?? "zh");
}

export default i18n;
