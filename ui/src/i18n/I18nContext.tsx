import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import enTranslations from "./translations/en.json";
import ruTranslations from "./translations/ru.json";
import esTranslations from "./translations/es.json";
import frTranslations from "./translations/fr.json";
import deTranslations from "./translations/de.json";
import zhTranslations from "./translations/zh.json";
import jaTranslations from "./translations/ja.json";
import ptTranslations from "./translations/pt.json";
import itTranslations from "./translations/it.json";

type Language = "en" | "ru" | "es" | "fr" | "de" | "zh" | "ja" | "pt" | "it";

type Translations = typeof enTranslations;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const translations: Record<Language, Translations> = {
  en: enTranslations,
  ru: ruTranslations,
  es: esTranslations,
  fr: frTranslations,
  de: deTranslations,
  zh: zhTranslations,
  ja: jaTranslations,
  pt: ptTranslations,
  it: itTranslations,
};

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("language");
    const validLanguages: Language[] = ["en", "ru", "es", "fr", "de", "zh", "ja", "pt", "it"];
    if (saved && validLanguages.includes(saved as Language)) {
      return saved as Language;
    }
    // Default to English
    return "en";
  });

  useEffect(() => {
    localStorage.setItem("language", language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string, params?: Record<string, string>): string => {
    const keys = key.split(".");
    let value: any = translations[language];

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        // Fallback to English if key not found
        value = enTranslations;
        for (const k2 of keys) {
          if (value && typeof value === "object" && k2 in value) {
            value = value[k2];
          } else {
            return key;
          }
        }
        break;
      }
    }

    if (typeof value !== "string") {
      return key;
    }

    // Replace parameters
    if (params) {
      return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
        return params[paramKey] || match;
      });
    }

    return value;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return context;
};

