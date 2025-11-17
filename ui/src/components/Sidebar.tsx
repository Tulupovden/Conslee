import React from "react";
import ConsleeLogo from "../assets/conslee-logo.svg";
import type { Tab } from "../types";
import { useI18n } from "../i18n/I18nContext";
import LanguageSwitcher from "./LanguageSwitcher";

type Props = {
  tab: Tab;
  setTab: (tab: Tab) => void;
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  isOpen?: boolean;
  onClose?: () => void;
  onShowSupport?: () => void;
};

const Sidebar: React.FC<Props> = ({ tab, setTab, theme, setTheme, isOpen, onClose, onShowSupport }) => {
  const { t } = useI18n();

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <aside className={`sidebar ${isOpen ? "sidebar-open" : ""}`}>
      <div className="sidebar-header">
        <img src={ConsleeLogo} alt="Conslee" className="sidebar-logo" />
      </div>

      <nav className="tabs">
        <button
          className={`tab ${tab === "all" ? "tab-active" : ""}`}
          onClick={() => {
            setTab("all");
            onClose?.();
          }}
        >
          {t("sidebar.all")}
        </button>
        <button
          className={`tab ${tab === "running" ? "tab-active" : ""}`}
          onClick={() => {
            setTab("running");
            onClose?.();
          }}
        >
          {t("sidebar.running")}
        </button>
        <button
          className={`tab ${tab === "scheduled" ? "tab-active" : ""}`}
          onClick={() => {
            setTab("scheduled");
            onClose?.();
          }}
        >
          {t("sidebar.scheduled")}
        </button>
        <div className="tab-separator" />
        <button
          className={`tab ${tab === "help" ? "tab-active" : ""}`}
          onClick={() => {
            setTab("help");
            onClose?.();
          }}
        >
          {t("sidebar.help")}
        </button>
      </nav>

      <div className="sidebar-footer">
        <button
          className="support-button"
          onClick={() => {
            onShowSupport?.();
            onClose?.();
          }}
        >
          {t("sidebar.support")}
        </button>
        <LanguageSwitcher />
        <button
          className="theme-toggle"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? t("sidebar.darkTheme") : t("sidebar.lightTheme")}
        </button>
      </div>
      {isOpen && (
        <button className="sidebar-close-button" onClick={onClose} aria-label="Close menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      )}
      </aside>
    </>
  );
};

export default Sidebar;