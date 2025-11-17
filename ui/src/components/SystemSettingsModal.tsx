import React, { useState, useRef, useEffect } from "react";
import type { SystemStatus } from "../types";
import { useI18n } from "../i18n/I18nContext";
import { isValidGoDuration } from "../utils/validation";

type Props = {
  system: SystemStatus;
  onClose: () => void;
  onSave: (patch: Partial<SystemStatus>) => Promise<void>;
};

type PortStatus = "idle" | "checking" | "available" | "unavailable" | "error";

const SystemSettingsModal: React.FC<Props> = ({ system, onClose, onSave }) => {
  const { t } = useI18n();
  const [isClosing, setIsClosing] = useState(false);
  const [listenAddr, setListenAddr] = useState(system.listenAddr);
  const [portStatus, setPortStatus] = useState<PortStatus>("idle");
  const [portError, setPortError] = useState<string | null>(null);
  const [portSaved, setPortSaved] = useState(false);
  const [idleReaperIntervalError, setIdleReaperIntervalError] = useState<string | null>(null);
  const checkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkPort = async (addr: string): Promise<{ available: boolean; error?: string }> => {
    if (!addr || addr.trim() === "") {
      setPortStatus("idle");
      setPortError(null);
      return { available: true };
    }

    // Validate format
    if (!addr.includes(":")) {
      setPortStatus("error");
      setPortError("Invalid format");
      return { available: false, error: "Invalid format" };
    }

    setPortStatus("checking");
    setPortError(null);

    try {
      const res = await fetch(
        `/api/system/check-port?listenAddr=${encodeURIComponent(addr)}`
      );
      if (!res.ok) {
        setPortStatus("error");
        setPortError("Failed to check port");
        return { available: false, error: "Failed to check port" };
      }

      const data = await res.json();
      if (data.available) {
        setPortStatus("available");
        setPortError(null);
        return { available: true };
      } else {
        setPortStatus("unavailable");
        const errorMsg = data.error || "Port is not available";
        setPortError(errorMsg);
        return { available: false, error: errorMsg };
      }
    } catch (e) {
      setPortStatus("error");
      setPortError("Error checking port");
      return { available: false, error: "Error checking port" };
    }
  };

  useEffect(() => {
    // Debounce port checking
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    if (listenAddr !== system.listenAddr) {
      checkTimeoutRef.current = setTimeout(() => {
        checkPort(listenAddr);
      }, 500);
    } else {
      setPortStatus("idle");
      setPortError(null);
    }

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [listenAddr, system.listenAddr]);

  useEffect(() => {
    setIdleReaperIntervalError(null);
  }, [system.idleReaperInterval]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleSave = async () => {
    if (listenAddr !== system.listenAddr) {
      // Check port before saving
      const result = await checkPort(listenAddr);
      if (!result.available) {
        return;
      }
      
      await onSave({ listenAddr });
      setPortSaved(true);
      // Reset after 5 seconds
      setTimeout(() => setPortSaved(false), 5000);
    }
  };

  const getPortStatusText = () => {
    switch (portStatus) {
      case "checking":
        return t("systemSettings.portChecking");
      case "available":
        return t("systemSettings.portAvailable");
      case "unavailable":
        return t("systemSettings.portUnavailable");
      case "error":
        return t("systemSettings.portError");
      default:
        return null;
    }
  };

  const canSave = listenAddr === system.listenAddr || portStatus === "available";

  return (
    <div
      className={`system-overlay ${isClosing ? 'closing' : ''}`}
      onClick={handleClose}
    >
      <div className="system-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{t("systemSettings.title")}</h2>

        <div className="settings-row">
          <label>{t("systemSettings.listenAddr")}</label>
          <input
            type="text"
            value={listenAddr}
            onChange={(e) => setListenAddr(e.target.value)}
          />
          {portStatus !== "idle" && (
            <div
              className={`port-status ${
                portStatus === "available"
                  ? "port-available"
                  : portStatus === "unavailable" || portStatus === "error"
                  ? "port-unavailable"
                  : "port-checking"
              }`}
            >
              {getPortStatusText()}
              {portError && <span className="port-error">: {portError}</span>}
            </div>
          )}
          {portSaved && (
            <div className="port-saved">
              {t("systemSettings.portSaved")}
            </div>
          )}
          <div className="settings-help">
            {t("systemSettings.listenAddrHelp")}
            <code> :8800</code>, <code>0.0.0.0:8800</code>, <code>127.0.0.1:8800</code>.
          </div>
        </div>

        <div className="settings-row">
          <label>{t("systemSettings.idleReaperInterval")}</label>
          <input
            type="text"
            defaultValue={system.idleReaperInterval}
            onChange={(e) => {
              const value = e.target.value.trim();
              if (value && !isValidGoDuration(value)) {
                setIdleReaperIntervalError(t("createService.errors.idleTimeoutInvalid"));
              } else {
                setIdleReaperIntervalError(null);
              }
            }}
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value) {
                if (isValidGoDuration(value)) {
                  onSave({ idleReaperInterval: value });
                  setIdleReaperIntervalError(null);
                } else {
                  setIdleReaperIntervalError(t("createService.errors.idleTimeoutInvalid"));
                }
              } else {
                setIdleReaperIntervalError(null);
              }
            }}
          />
          {idleReaperIntervalError && (
            <div className="settings-help error-text">{idleReaperIntervalError}</div>
          )}
          {!idleReaperIntervalError && (
            <div className="settings-help">
              {t("systemSettings.idleReaperIntervalHelp")}
              <code> 1m</code>, <code>30s</code>, <code>5m</code>.
            </div>
          )}
        </div>

        <div className="system-footer">
          <button className="btn btn-secondary" onClick={handleClose}>
            {t("systemSettings.close")}
          </button>
          {listenAddr !== system.listenAddr && (
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={!canSave || portStatus === "checking"}
            >
              {t("systemSettings.save")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SystemSettingsModal;