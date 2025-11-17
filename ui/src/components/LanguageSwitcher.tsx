import React from "react";
import { useI18n } from "../i18n/I18nContext";
import CustomDropdown from "./CustomDropdown";

type Language = "en" | "ru" | "es" | "fr" | "de" | "zh" | "ja" | "pt" | "it";

interface LanguageOption {
  code: Language;
  name: string;
}

const languages: LanguageOption[] = [
  { code: "en", name: "English" },
  { code: "ru", name: "Русский" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "zh", name: "中文" },
  { code: "ja", name: "日本語" },
  { code: "pt", name: "Português" },
  { code: "it", name: "Italiano" },
];

const LanguageSwitcher: React.FC = () => {
  const { language, setLanguage } = useI18n();

  return (
    <div className="language-switcher">
      <CustomDropdown
        value={language}
        onChange={(value) => setLanguage(value as Language)}
        options={languages.map((lang) => ({
          value: lang.code,
          label: lang.name,
        }))}
      />
    </div>
  );
};

export default LanguageSwitcher;

