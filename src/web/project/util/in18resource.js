import en from "./i18/en.json";
import zh from "./i18/zh.json";
import de from "./i18/de.json";
import ja from "./i18/ja.json";
import ko from "./i18/ko.json";
import ru from "./i18/ru.json";
import fr from "./i18/fr.json";
import es from "./i18/es.json";
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const resources = {

    "en": {
        translation: en // 英语
    },
    "zh": {
        translation: zh // 中文
    },
    "de": {
        translation: de // 德语
    },
    "ja": {
        translation: ja // 日语
    },
    "ko": {
        translation: ko // 韩语
    },
    "ru": {
        translation: ru // 俄语
    },
    "fr": {
        translation: fr // 法语
    },
    "es": {
        translation: es // 西班牙语
    }
}
let lan;
const data = localStorage.getItem("user_base_info");
if (data) {
    lan = JSON.parse(data)['language'];
}
i18n
    // 将 i18n 实例传递给 react-i18next
    .use(initReactI18next)
    // 初始化 i18next
    // 所有配置选项: https://www.i18next.com/overview/configuration-options
    .init({
        resources,
        fallbackLng: "zh",
        lng: lan,
        // debug: true,
        interpolation: {
            escapeValue: false, // not needed for react as it escapes by default
        }
    });

export default i18n;
