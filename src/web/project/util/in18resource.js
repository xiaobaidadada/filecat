import en from "./i18/en.json";
import zh from "./i18/zh.json";
import pt from "./i18/pt.json";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const resources = {
  en: {
    translation: en,
  },
  zh: {
    translation: zh,
  },
  pt: {
    translation: pt,
  },
};

const DEFAULT_LANGUAGE = "en";
const LANGUAGE_KEY = "language";
const USER_INFO_KEY = "user_base_info";


if (typeof localStorage === "undefined" || localStorage === null) {
  global.localStorage = {
    store: {},
    getItem(key) {
      return this.store[key] || null;
    },
    setItem(key, value) {
      this.store[key] = value;
    },
    removeItem(key) {
      delete this.store[key];
    },
    clear() {
      this.store = {};
    },
  };
}


function getInitialLanguage() {
  if (typeof localStorage !== "undefined") {
    const data = localStorage.getItem(USER_INFO_KEY);
    if (data) {
      try {
        const userInfo = JSON.parse(data);
        return userInfo[LANGUAGE_KEY] || DEFAULT_LANGUAGE;
      } catch (error) {
        console.error("Failed to parse user info:", error);
      }
    }
  }
  return DEFAULT_LANGUAGE;
}

const initialLanguage = getInitialLanguage();

i18n.use(initReactI18next).init({
  resources,
  fallbackLng: DEFAULT_LANGUAGE,
  lng: initialLanguage,
  interpolation: {
    escapeValue: false, 
  },
});

export default i18n;
