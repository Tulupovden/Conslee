import React, { useEffect, useState, useMemo, useRef } from "react";
import type { ServiceStatus } from "../types";
import { useI18n } from "../i18n/I18nContext";
import { isValidHost, isValidURL, isValidGoDuration } from "../utils/validation";
import CustomDropdown from "./CustomDropdown";
import { useProxyHealthCheck, useTargetHealthCheck } from "../hooks/useHealthChecks";
import { useCardGridColumns } from "../hooks/useCardGridColumns";

// Icon components
const ContainerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
    <path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.8 0L7.8 6.2c-.4.3-.8.9-.8 1.5v8.5c0 .6.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.8 0l6.3-3.9c.4-.3.8-.9.8-1.5Z"/>
    <path d="M12 22V12"/>
    <path d="m2 8 10 6 10-6"/>
    <path d="M7 5.1v6.4"/>
    <path d="M17 5.1v6.4"/>
  </svg>
);

const ClockIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>
);

const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
    <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
    <line x1="16" x2="16" y1="2" y2="6"/>
    <line x1="8" x2="8" y1="2" y2="6"/>
    <line x1="3" x2="21" y1="10" y2="10"/>
  </svg>
);

const TimerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
    <line x1="10" x2="14" y1="2" y2="2"/>
    <line x1="12" x2="15" y1="14" y2="11"/>
    <circle cx="12" cy="14" r="8"/>
  </svg>
);

const ActivityIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
);

const WEEK_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const ALL_WEEK_DAY_KEYS = WEEK_DAY_KEYS.slice();

export type ServiceSettingsPatch = {
  mode?: string;
  idleTimeout?: string;
  schedule?: { days?: string[]; start?: string; stop?: string };
  containers?: string[];
  targetUrl?: string;
  healthPath?: string;
  startupTimeout?: string;
  host?: string;
  enabled?: boolean;
};

type Props = {
  service: ServiceStatus;
  isEditing: boolean;
  onToggleEditing: () => void;
  saving: boolean;
  onSaveSettings: (svc: ServiceStatus, patch: ServiceSettingsPatch) => void;
  onStart: (name: string) => void;
  onStop: (name: string) => void;
  onDelete: (name: string) => void;
  formatLastActivity: (iso: string) => string;
  availableContainers: string[];
  cardIndex: number;
  columnIndex: number;
  columnCount: number;
};

const ServiceCard: React.FC<Props> = ({
  service,
  isEditing,
  onToggleEditing,
  saving,
  onSaveSettings,
  onStart,
  onStop,
  onDelete,
  formatLastActivity,
  availableContainers,
  cardIndex,
  columnIndex,
  columnCount,
}) => {
  const { t } = useI18n();

  const WEEK_DAYS = useMemo(() => 
    WEEK_DAY_KEYS.map((key) => ({
      key,
      label: t(`weekDays.${key}`),
    })),
    [t]
  );

  const [localContainers, setLocalContainers] = useState<string[]>(
    service.containers ?? [],
  );

  useEffect(() => {
    setLocalContainers(service.containers ?? []);
  }, [service.containers, service.name]);

  const availableForSelect = availableContainers.filter(
    (name) => !localContainers.includes(name),
  );

  const schedule = service.schedule;

  const [localEnabled, setLocalEnabled] = useState<boolean>(service.enabled);

  useEffect(() => {
    setLocalEnabled(service.enabled);
  }, [service.enabled]);

  const [localMode, setLocalMode] = useState(service.mode);
  const [pendingMode, setPendingMode] = useState<string | null>(null);
  const [modeHint, setModeHint] = useState<string | null>(null);
  const [hostHint, setHostHint] = useState<string | null>(null);
  const [idleTimeoutError, setIdleTimeoutError] = useState<string | null>(null);
  const [startupTimeoutError, setStartupTimeoutError] = useState<string | null>(null);
  const proxyHealth = useProxyHealthCheck(service);
  const targetHealth = useTargetHealthCheck(service, proxyHealth);
  const targetInputRef = useRef<HTMLInputElement | null>(null);
  const hostInputRef = useRef<HTMLInputElement | null>(null);
  const serviceToggleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalMode(service.mode);
    setPendingMode(null);
    setModeHint(null);
    setIdleTimeoutError(null);
    setStartupTimeoutError(null);
  }, [service.mode, service.idleTimeout, service.startupTimeout]);


  useEffect(() => {
    if (targetInputRef.current) {
      targetInputRef.current.value = service.targetUrl || "";
    }
  }, [service.targetUrl]);

  useEffect(() => {
    if (hostInputRef.current) {
      hostInputRef.current.value = service.host || "";
    }
    setHostHint(null);
  }, [service.host]);

  const isScheduleOnlyActual = service.mode === "schedule_only";
  const isBothActual = service.mode === "both";
  const isScheduleModeActual = isScheduleOnlyActual || isBothActual;

  const isScheduleOnlyEdit = localMode === "schedule_only";
  const isBothEdit = localMode === "both";
  const isScheduleModeEdit = isScheduleOnlyEdit || isBothEdit;

  const [localDays, setLocalDays] = useState<string[]>(
    () => schedule?.days ?? [],
  );

  useEffect(() => {
    setLocalDays(schedule?.days ?? []);
  }, [schedule?.days, service.mode]);

  const effectiveDays =
    localDays.length > 0 ? localDays : ALL_WEEK_DAY_KEYS;

  const hasScheduleInfo =
    !!schedule &&
    ((effectiveDays && effectiveDays.length > 0) ||
      !!schedule.start ||
      !!schedule.stop);

  const showScheduleTiles = isScheduleModeActual && hasScheduleInfo;

  const showIdleTile = !isScheduleOnlyActual;
  const showIdleField = !isScheduleOnlyEdit;

  const itemCount = useMemo(() => {
    let count = 1;
    if (showIdleTile) count++;
    if (showScheduleTiles) count += 2;
    count++;
    return count;
  }, [showIdleTile, showScheduleTiles]);

  const { cardRef, bodyRef } = useCardGridColumns(
    cardIndex,
    columnIndex,
    itemCount,
    columnCount
  );


  const serviceDisabled = !localEnabled;
  const hostDisplay = service.host || "—";
  const targetDisplay = service.targetUrl || "—";
  const hasProxyIssue = proxyHealth === "unhealthy";
  const hasTargetIssue = !hasProxyIssue && targetHealth === "unhealthy";
  const statusBaseClass = service.running ? "status-running" : "status-stopped";
  const statusIssueClass = hasProxyIssue
    ? "status-proxy-error"
    : hasTargetIssue
      ? "status-target-error"
      : "";
  const proxyWarningTitle = t("serviceCard.proxyUnhealthyWarning", {
    host: service.host,
  });
  const targetWarningTitle = t("serviceCard.targetUnhealthyWarning", {
    target: targetDisplay,
  });
  const statusTitle = hasProxyIssue
    ? proxyWarningTitle
    : hasTargetIssue
      ? targetWarningTitle
      : service.running
        ? t("serviceCard.running")
        : t("serviceCard.stopped");

  const toggleDay = (key: string) => {
    const current = new Set(effectiveDays);

    if (current.has(key)) {
      if (current.size === 1) return;
      current.delete(key);
    } else {
      current.add(key);
    }

    const newEffective = Array.from(current).sort(
      (a, b) =>
        ALL_WEEK_DAY_KEYS.indexOf(a as typeof WEEK_DAY_KEYS[number]) - ALL_WEEK_DAY_KEYS.indexOf(b as typeof WEEK_DAY_KEYS[number]),
    );

    const newStored =
      newEffective.length === ALL_WEEK_DAY_KEYS.length
        ? []
        : newEffective;

    setLocalDays(newStored);

    onSaveSettings(service, {
      schedule: {
        ...(schedule || {}),
        days: newStored,
      },
    });
  };

  const handleToggleEnabled = () => {
    if (saving) return;
    const next = !localEnabled;
    setLocalEnabled(next);
    setPendingMode(null);
    setModeHint(null);
    setHostHint(null);
    onSaveSettings(service, { enabled: next });
  };

  const applyModeChange = (
    nextMode: "on_demand" | "schedule_only" | "both"
  ) => {
    const currentHost = (hostInputRef.current?.value || "").trim();
    const currentTarget =
      (targetInputRef.current?.value || "").trim() ||
      (service.targetUrl || "").trim();
  
    if (nextMode === "schedule_only") {
      const patch: ServiceSettingsPatch = { mode: nextMode };
      if (currentHost !== service.host) {
        patch.host = currentHost;
      }
      onSaveSettings(service, patch);
      setLocalMode(nextMode);
      setPendingMode(null);
      setModeHint(null);
      return;
    }
  
    if (!currentTarget) {
      setPendingMode(nextMode);
      setModeHint(t("createService.errors.targetRequired"));
      requestAnimationFrame(() => {
        targetInputRef.current?.focus();
      });
      return;
    }
  
    if (!isValidURL(currentTarget)) {
      setPendingMode(nextMode);
      setModeHint(t("createService.errors.targetInvalid"));
      requestAnimationFrame(() => {
        targetInputRef.current?.focus();
      });
      return;
    }
  
    const patch: ServiceSettingsPatch = {
      mode: nextMode,
      targetUrl: currentTarget,
    };
    if (currentHost !== service.host) {
      patch.host = currentHost;
    }
  
    onSaveSettings(service, patch);
    setLocalMode(nextMode);
    setPendingMode(null);
    setModeHint(null);
  };

  return (
    <article
      ref={cardRef}
      className={`card ${isEditing ? "card-expanded" : "card-collapsed"} ${serviceDisabled ? "card-disabled" : ""}`}
    >
      <div className="card-header">
        <div>
          <div className="card-title">
            {service.name}
            <span
              className={`status-dot ${statusBaseClass} ${statusIssueClass}`}
              title={statusTitle}
            />
          </div>
          <div className="card-host">
            <span className="card-host-text">{hostDisplay}</span>
            {hasProxyIssue && (
              <span className="proxy-warning-group" role="presentation">
                <span
                  className="proxy-warning-icon"
                  role="img"
                  aria-label={t("serviceCard.proxyUnhealthy")}
                >
                  ⚠️
                </span>
                <span className="proxy-warning-popover">{proxyWarningTitle}</span>
              </span>
            )}
            {hasTargetIssue && (
              <span className="proxy-warning-group" role="presentation">
                <span
                  className="proxy-warning-icon"
                  role="img"
                  aria-label={t("serviceCard.targetUnhealthy")}
                >
                  ⚠️
                </span>
                <span className="proxy-warning-popover">{targetWarningTitle}</span>
              </span>
            )}
          </div>
        </div>
        <div className="card-header-actions">
          <div 
            className={`mode-badge mode-badge-compact ${serviceDisabled ? "mode-badge-disabled" : ""}`}
          >
            {service.mode === "on_demand" && t("serviceCard.modeOnDemand")}
            {service.mode === "schedule_only" && t("serviceCard.modeScheduleOnly")}
            {service.mode === "both" && t("serviceCard.modeBoth")}
          </div>
          <div
            className={`service-toggle ${serviceDisabled ? "service-toggle-disabled" : "service-toggle-enabled"}`}
            title={t("serviceCard.toggleHelp")}
            ref={serviceToggleRef}
          >
            <button
              type="button"
              className={`service-toggle-button ${serviceDisabled ? "service-toggle-button-off" : "service-toggle-button-on"}`}
              onClick={handleToggleEnabled}
              disabled={saving}
              aria-pressed={!serviceDisabled}
              aria-label={t("serviceCard.toggleHelp")}
            >
              <span className="service-toggle-thumb" />
            </button>
          </div>
        </div>
      </div>

      <div className="card-body" ref={bodyRef}>
        <div className="card-row">
          <span className="card-row-icon">
            <ContainerIcon />
          </span>
          <span className="label">{t("serviceCard.containers")}</span>
          <span className="value">
            {service.containers && service.containers.length
              ? service.containers.join(", ")
              : "—"}
          </span>
        </div>

        {showIdleTile && (
          <div className="card-row">
            <span className="card-row-icon">
              <TimerIcon />
            </span>
            <span className="label">{t("serviceCard.idleTimeout")}</span>
            <span className="value">{service.idleTimeout || "—"}</span>
          </div>
        )}

        {showScheduleTiles && schedule && (
          <>
            <div className="card-row">
              <span className="card-row-icon">
                <CalendarIcon />
              </span>
              <span className="label">{t("serviceCard.days")}</span>
              <span className="value">
                {schedule.days && schedule.days.length
                  ? schedule.days.join(", ")
                  : t("serviceCard.daily")}
              </span>
            </div>
            <div className="card-row">
              <span className="card-row-icon">
                <ClockIcon />
              </span>
              <span className="label">{t("serviceCard.timeWindow")}</span>
              <span className="value">
                {(() => {
                  const start = schedule.start || "";
                  const stop = schedule.stop || "";
                  const allDays = effectiveDays.length === ALL_WEEK_DAY_KEYS.length;

                  if (!start && !stop) {
                    return allDays ? t("serviceCard.roundTheClock") : t("serviceCard.roundTheClock");
                  }

                  if (start && stop && start === stop) {
                    return allDays ? t("serviceCard.roundTheClock") : t("serviceCard.roundTheClock");
                  }

                  if (start && stop) {
                    return `${start} — ${stop}`;
                  }
                  if (start && !stop) {
                    return `${start} — 00:00`;
                  }
                  // !start && stop
                  return `${t("serviceCard.until")} ${stop}`;
                })()}
              </span>
            </div>
          </>
        )}

        <div className="card-row">
          <span className="card-row-icon">
            <ActivityIcon />
          </span>
          <span className="label">{t("serviceCard.lastActivity")}</span>
          <span className="value">
            {formatLastActivity(service.lastActivity)}
          </span>
        </div>
      </div>

      <div className="card-footer">
        <button className="btn btn-ghost" onClick={onToggleEditing}>
          {isEditing ? t("serviceCard.hide") : t("serviceCard.settings")}
        </button>

        <button
          className={service.running ? "btn btn-secondary" : "btn btn-primary"}
          disabled={saving}
          onClick={() =>
            service.running
              ? onStop(service.name)
              : onStart(service.name)
          }
        >
          {service.running ? t("serviceCard.sleep") : t("serviceCard.wake")}
        </button>
      </div>

      <div
        className={`settings-panel ${isEditing ? "settings-panel-open" : "settings-panel-closed"
          }`}
      >
        <div className="settings-inner">

          <div className="settings-section">
            <div className="settings-section-title">{t("serviceCard.sections.modeAndAccess")}</div>

            <div className="settings-row">
              <label>{t("createService.mode")}</label>
              <CustomDropdown
                value={localMode}
                options={[
                  { value: "on_demand", label: t("createService.modeOnDemand") },
                  { value: "schedule_only", label: t("createService.modeScheduleOnly") },
                  { value: "both", label: t("createService.modeBoth") },
                ]}
                onChange={(value) => {
                  const nextMode = value as "on_demand" | "schedule_only" | "both";
                  const requiresHost = nextMode !== "schedule_only";
                  const currentHost = (hostInputRef.current?.value || "").trim();

                  const ensureHostValid = () => {
                    if (requiresHost && !currentHost) {
                      setHostHint(t("createService.errors.hostRequired"));
                      setPendingMode(nextMode);
                      setModeHint(null);
                      requestAnimationFrame(() => {
                        hostInputRef.current?.focus();
                      });
                      return false;
                    }
                    if (currentHost && !isValidHost(currentHost)) {
                      setHostHint(t("createService.errors.hostInvalid"));
                      setPendingMode(nextMode);
                      setModeHint(null);
                      requestAnimationFrame(() => {
                        hostInputRef.current?.focus();
                      });
                      return false;
                    }
                    setHostHint(null);
                    return true;
                  };

                  if (!ensureHostValid()) {
                    return;
                  }

                  setLocalMode(nextMode);

                  if (!ensureHostValid()) {
                    return;
                  }
                  
                  applyModeChange(nextMode);

                  const currentTarget =
                    (targetInputRef.current?.value || "").trim() ||
                    (service.targetUrl || "").trim();

                  if (currentTarget) {
                    if (!isValidURL(currentTarget)) {
                      setPendingMode(nextMode);
                      setModeHint(t("createService.errors.targetInvalid"));
                      requestAnimationFrame(() => {
                        targetInputRef.current?.focus();
                      });
                      return;
                    }

                    const patch: ServiceSettingsPatch = {
                      mode: nextMode,
                      targetUrl: currentTarget,
                    };
                    if (currentHost !== service.host) {
                      patch.host = currentHost;
                    }

                    onSaveSettings(service, patch);
                    setPendingMode(null);
                    setModeHint(null);
                    return;
                  }

                  setPendingMode(nextMode);
                  setModeHint(t("createService.errors.targetRequired"));
                  requestAnimationFrame(() => {
                    targetInputRef.current?.focus();
                  });
                }}
                disabled={saving}
              />
            </div>
            {modeHint && (
              <div className="settings-help error-text">{modeHint}</div>
            )}

            <div className="settings-row">
              <label>{t("createService.host")}</label>
              <input
                type="text"
                defaultValue={service.host}
                ref={hostInputRef}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                
                  if (!v) {
                    if (localMode === "schedule_only") {
                      setHostHint(null);
                      if (service.host !== "") {
                        onSaveSettings(service, { host: "" });
                      }
                    } else {
                      setHostHint(t("createService.errors.hostRequired"));
                      return;
                    }
                  } else {
                    if (!isValidHost(v)) {
                      setHostHint(t("createService.errors.hostInvalid"));
                      return;
                    }
                
                    if (v !== service.host) {
                      onSaveSettings(service, { host: v });
                    }
                    setHostHint(null);
                  }

                  if (pendingMode) {
                    applyModeChange(
                      pendingMode as "on_demand" | "schedule_only" | "both"
                    );
                  }
                }}
                disabled={saving}
              />
              {hostHint ? (
                <div className="settings-help error-text">{hostHint}</div>
              ) : null}
            </div>

            <div className="settings-row">
              <label>{t("serviceCard.containers")}</label>
              <div className="containers-chips-edit">
                {localContainers.map((name) => (
                  <span key={name} className="container-chip-selected">
                    <span className="container-chip-label">{name}</span>
                    <button
                      type="button"
                      className="container-chip-remove"
                      onClick={() => {
                        const next = localContainers.filter((c) => c !== name);
                        setLocalContainers(next);
                        onSaveSettings(service, { containers: next });
                      }}
                      disabled={saving}
                    >
                      ×
                    </button>
                  </span>
                ))}

                <CustomDropdown
                  value=""
                  options={availableForSelect.map((name) => ({
                    value: name,
                    label: name,
                  }))}
                  onChange={(value) => {
                    if (!value) return;
                    const next = [...localContainers, value];
                    setLocalContainers(next);
                    onSaveSettings(service, { containers: next });
                  }}
                  placeholder={availableForSelect.length
                    ? t("serviceCard.addContainer")
                    : t("serviceCard.noContainersAvailable")}
                  disabled={saving || availableForSelect.length === 0}
                />
              </div>
              <div className="settings-help">
                {t("serviceCard.containerHelp")}
              </div>
            </div>

            <div className="settings-row">
              <label>{t("createService.targetUrl")}</label>
              <input
                type="text"
                defaultValue={service.targetUrl}
                ref={targetInputRef}
                onBlur={(e) => {
                  const v = e.target.value.trim();

                  if (!v) {
                    if (pendingMode) {
                      const requiresHost = pendingMode !== "schedule_only";
                      const currentHost = (hostInputRef.current?.value || "").trim();

                      if (requiresHost && !currentHost) {
                        setModeHint(t("createService.errors.hostRequired"));
                        requestAnimationFrame(() => {
                          hostInputRef.current?.focus();
                        });
                      } else if (currentHost && !isValidHost(currentHost)) {
                        setModeHint(t("createService.errors.hostInvalid"));
                        requestAnimationFrame(() => {
                          hostInputRef.current?.focus();
                        });
                      } else {
                        setModeHint(t("createService.errors.targetRequired"));
                      }
                    } else {
                      if (localMode === "schedule_only") {
                        onSaveSettings(service, { targetUrl: "" });
                      }
                      setModeHint(localMode === "schedule_only" ? null : t("createService.errors.targetRequired"));
                    }
                    return;
                  }

                  if (!isValidURL(v)) {
                    setModeHint(t("createService.errors.targetInvalid"));
                    return;
                  }

                  if (pendingMode) {
                    const requiresHost = pendingMode !== "schedule_only";
                    const currentHost = (hostInputRef.current?.value || "").trim();

                    if (requiresHost && !currentHost) {
                      setModeHint(t("createService.errors.hostRequired"));
                      requestAnimationFrame(() => {
                        hostInputRef.current?.focus();
                      });
                      return;
                    }

                    if (currentHost && !isValidHost(currentHost)) {
                      setModeHint(t("createService.errors.hostInvalid"));
                      requestAnimationFrame(() => {
                        hostInputRef.current?.focus();
                      });
                      return;
                    }

                    const patch: ServiceSettingsPatch = {
                      mode: pendingMode,
                      targetUrl: v,
                    };

                    if (currentHost !== service.host) {
                      patch.host = currentHost;
                    }

                    onSaveSettings(service, patch);
                    setPendingMode(null);
                    setModeHint(null);
                    return;
                  }

                  onSaveSettings(service, { targetUrl: v });
                  setModeHint(null);
                }}
                disabled={saving}
              />
              <div className="settings-help">
                {t("serviceCard.targetUrlHelp")}
                <code> http://127.0.0.1:9980</code>.
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-title">{t("serviceCard.sections.timeouts")}</div>


            {showIdleField && (
              <div className="settings-row">
                <label>{t("serviceCard.idleTimeoutLabel")}</label>
                <input
                  type="text"
                  defaultValue={service.idleTimeout}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    if (value && !isValidGoDuration(value)) {
                      setIdleTimeoutError(t("createService.errors.idleTimeoutInvalid"));
                    } else {
                      setIdleTimeoutError(null);
                    }
                  }}
                  onBlur={(e) => {
                    const value = e.target.value.trim();
                    if (value) {
                      if (isValidGoDuration(value)) {
                        onSaveSettings(service, { idleTimeout: value });
                        setIdleTimeoutError(null);
                      } else {
                        setIdleTimeoutError(t("createService.errors.idleTimeoutInvalid"));
                      }
                    } else {
                      setIdleTimeoutError(null);
                    }
                  }}
                  disabled={saving}
                />
                {idleTimeoutError && (
                  <div className="settings-help error-text">{idleTimeoutError}</div>
                )}
                {!idleTimeoutError && (
                  <div className="settings-help">
                    {t("serviceCard.idleTimeoutHelp")}
                    <code> 1m</code>, <code>30s</code>, <code>1h30m</code>.
                  </div>
                )}
              </div>
            )}

            <div className="settings-row">
              <label>{t("serviceCard.startupTimeoutLabel")}</label>
              <input
                type="text"
                defaultValue={service.startupTimeout}
                onChange={(e) => {
                  const value = e.target.value.trim();
                  if (value && !isValidGoDuration(value)) {
                    setStartupTimeoutError(t("createService.errors.startupTimeoutInvalid"));
                  } else {
                    setStartupTimeoutError(null);
                  }
                }}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v) {
                    if (isValidGoDuration(v)) {
                      onSaveSettings(service, { startupTimeout: v });
                      setStartupTimeoutError(null);
                    } else {
                      setStartupTimeoutError(t("createService.errors.startupTimeoutInvalid"));
                    }
                  } else {
                    setStartupTimeoutError(null);
                  }
                }}
                disabled={saving}
              />
              {startupTimeoutError && (
                <div className="settings-help error-text">{startupTimeoutError}</div>
              )}
              {!startupTimeoutError && (
                <div className="settings-help">
                  {t("serviceCard.startupTimeoutHelp")}
                  <code> 30s</code>, <code>2m</code>, <code>1m30s</code>.
                </div>
              )}
            </div>
          </div>

          {isScheduleModeEdit && (
            <div className="settings-section">
              <div className="settings-section-title">
                {t("serviceCard.sections.schedule")}
              </div>

              <div className="settings-row">
                <label>{t("createService.weekdays")}</label>
                <div className="weekdays-chips">
                  {WEEK_DAYS.map((d) => {
                    const active = effectiveDays.includes(d.key);
                    return (
                      <button
                        type="button"
                        key={d.key}
                        className={
                          "weekday-chip" +
                          (active ? " weekday-chip-active" : "")
                        }
                        onClick={() => toggleDay(d.key)}
                        disabled={saving}
                      >
                        <span className="weekday-chip-dot" />
                        <span className="weekday-chip-label">{d.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="settings-help">
                  {t("serviceCard.weekdaysHelp")}
                </div>
              </div>

              <div className="settings-row">
                <label>{t("createService.timeWindow")}</label>
                <div className="settings-inline">
                  <input
                    type="time"
                    step={60 * 5}
                    defaultValue={service.schedule?.start || ""}
                    onBlur={(e) =>
                      onSaveSettings(service, {
                        schedule: {
                          ...(schedule || {}),
                          start: e.target.value.trim(),
                        },
                      })
                    }
                    disabled={saving}
                  />
                  <span>—</span>
                  <input
                    type="time"
                    step={60 * 5}
                    defaultValue={service.schedule?.stop || ""}
                    onBlur={(e) =>
                      onSaveSettings(service, {
                        schedule: {
                          ...(schedule || {}),
                          stop: e.target.value.trim(),
                        },
                      })
                    }
                    disabled={saving}
                  />
                </div>
                <div className="settings-help">
                  {t("serviceCard.timeWindowHelp")}
                </div>
              </div>
            </div>
          )}

          {/* Health check */}
          <div className="settings-section">
            <div className="settings-section-title">{t("serviceCard.sections.healthCheck")}</div>

            <div className="settings-row">
              <label>{t("serviceCard.healthPathLabel")}</label>
              <input
                type="text"
                defaultValue={service.healthPath || ""}
                onBlur={(e) => {
                  onSaveSettings(service, { healthPath: e.target.value.trim() });
                }}
                disabled={saving}
              />
              <div className="settings-help">
                {t("serviceCard.healthPathHelp")}
                <code> /</code> {t("serviceCard.healthPathHelp2")} <code>/health</code>. {t("serviceCard.healthPathHelp3")}
              </div>
            </div>
          </div>

          <div className="settings-row settings-row-danger">
            <button
              className="btn btn-danger"
              onClick={() => onDelete(service.name)}
            >
              {t("serviceCard.deleteService")}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
};

export default ServiceCard;