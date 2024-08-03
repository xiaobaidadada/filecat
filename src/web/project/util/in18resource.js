import en from "./i18/en.json";
import zh from "./i18/zh.json";
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

export const resources = {

    "en": {
        translation: en
    },
    "zh": {
        translation: zh
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
        fallbackLng: "en",
        lng: lan,
        // debug: true,
        interpolation: {
            escapeValue: false, // not needed for react as it escapes by default
        }
    });

export default i18n;
