import React, { useState } from "react";
import { useI18n } from "../i18n/I18nContext";

type Props = {
  onClose: () => void;
};

const SupportModal: React.FC<Props> = ({ onClose }) => {
  const { t } = useI18n();
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  return (
    <div
      className={`system-overlay ${isClosing ? 'closing' : ''}`}
      onClick={handleClose}
    >
      <div className="system-panel support-modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t("support.title")}</h2>
        
        <div className="support-content">
          <p className="support-intro">{t("support.intro")}</p>
          
          <div className="support-links">
            <a
              href={t("support.donationAlerts.url")}
              target="_blank"
              rel="noopener noreferrer"
              className="support-link support-link-donationalerts"
            >
              <div className="support-link-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
                  <line x1="7" y1="7" x2="7.01" y2="7"/>
                </svg>
              </div>
              <div className="support-link-content">
                <div className="support-link-title">{t("support.donationAlerts.title")}</div>
                <div className="support-link-description">{t("support.donationAlerts.description")}</div>
              </div>
            </a>
          </div>
        </div>

        <div className="system-footer">
          <button className="btn btn-secondary" onClick={handleClose}>
            {t("support.close")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SupportModal;

