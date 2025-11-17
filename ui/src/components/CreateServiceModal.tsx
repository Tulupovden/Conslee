import React, { useState, useMemo, useEffect, useRef, Fragment } from "react";
import type { DockerContainer } from "../types";
import {
  isValidHost,
  isValidURL,
  isValidGoDuration,
  isValidHHMM,
} from "../utils/validation";
import { useI18n } from "../i18n/I18nContext";
import CustomDropdown from "./CustomDropdown";

const WEEK_DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const ALL_WEEK_DAY_KEYS = WEEK_DAY_KEYS.slice();

type Props = {
  stacks: string[];
  containers: DockerContainer[];
  selectedStack: string | null;
  setSelectedStack: React.Dispatch<React.SetStateAction<string | null>>;
  showAdvancedCreate: boolean;
  setShowAdvancedCreate: React.Dispatch<React.SetStateAction<boolean>>;
  createError: string | null;
  setCreateError: React.Dispatch<React.SetStateAction<string | null>>;
  onClose: () => void;
  onCreated: () => void;
  guessTargetFromSelection: () => void;
  busyContainers: string[];
  onNavigateToHelp?: () => void;
};

const CreateServiceModal: React.FC<Props> = ({
  stacks,
  containers,
  selectedStack,
  setSelectedStack,
  showAdvancedCreate,
  setShowAdvancedCreate,
  createError,
  setCreateError,
  onClose,
  onCreated,
  guessTargetFromSelection,
  busyContainers,
  onNavigateToHelp,
}) => {
  const { t } = useI18n();
  const [isClosing, setIsClosing] = useState(false);
  const [showProxyNotification, setShowProxyNotification] = useState(false);
  const advancedWrapperRef = useRef<HTMLDivElement | null>(null);

  const WEEK_DAYS = useMemo(() =>
    WEEK_DAY_KEYS.map((key) => ({
      key,
      label: t(`weekDays.${key}`),
    })),
    [t]
  );

  const [mode, setMode] = useState<"on_demand" | "schedule_only" | "both">(
    "on_demand",
  );

  const [localDays, setLocalDays] = useState<string[]>([]);
  const effectiveDays =
    localDays.length > 0 ? localDays : ALL_WEEK_DAY_KEYS;

  const [idleTimeoutError, setIdleTimeoutError] = useState<string | null>(null);
  const [startupTimeoutError, setStartupTimeoutError] = useState<string | null>(null);

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
      newEffective.length === ALL_WEEK_DAY_KEYS.length ? [] : newEffective;

    setLocalDays(newStored);
  };

  const isScheduleOnly = mode === "schedule_only";
  const showSchedule = isScheduleOnly || mode === "both";
  const showIdleTimeout = !isScheduleOnly;

  const availableContainers = (containers || []).filter(
    (c) =>
      c.name !== "conslee" && !(busyContainers || []).includes(c.name),
  );

  const stacksWithAvailable = (stacks || []).filter((s) =>
    availableContainers.some((c) => c.stack === s),
  );

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
    }, 300);
  };


  const handleToggleAdvanced = () => {
    setShowAdvancedCreate((prev) => !prev);
  };


  useEffect(() => {
    const wrapper = advancedWrapperRef.current;
    if (!wrapper) return;
    
    const inner = wrapper.querySelector('.advanced-settings-inner') as HTMLElement;
    if (!inner) return;

    if (showAdvancedCreate) {
      inner.style.maxHeight = "none";
      const fullHeight = inner.scrollHeight;

      inner.style.maxHeight = "0px";
      inner.getBoundingClientRect();

      inner.style.maxHeight = `${fullHeight}px`;
      inner.style.opacity = "1";
      inner.style.marginTop = "12px";
    } else {
      inner.style.maxHeight = "0px";
      inner.style.opacity = "0";
      inner.style.marginTop = "0";
    }
  }, [showAdvancedCreate]);

  return (
    <div
      className={`system-overlay ${isClosing ? 'closing' : ''}`}
      onClick={handleClose}
    >
      <div className="system-panel" onClick={(e) => e.stopPropagation()}>
        <h2>{t("createService.title")}</h2>

        <div className="settings-row">
          <label>{t("createService.name")}</label>
          <input id="create-name" type="text" />
        </div>

        <div className="settings-row">
          <label>{t("createService.host")}</label>
          <input id="create-host" type="text" />
        </div>

        <div className="settings-row">
          <label>{t("createService.stack")}</label>
          <CustomDropdown
            id="create-stack"
            value={selectedStack || ""}
            options={stacksWithAvailable.map((s) => ({
              value: s,
              label: s,
            }))}
            onChange={(value) => {
              const stack = value || null;
              setSelectedStack(stack);

              const checkboxes = Array.from(
                document.querySelectorAll(
                  '.system-panel input[type="checkbox"][data-stack]'
                )
              ) as HTMLInputElement[];

              checkboxes.forEach((c) => (c.checked = false));

              if (stack) {
                checkboxes
                  .filter((c) => c.dataset.stack === stack)
                  .forEach((c) => (c.checked = true));
              }
              guessTargetFromSelection();
            }}
            placeholder={t("createService.selectStack")}
          />

          {selectedStack && (
            <div className="selected-stack">
              <span>{selectedStack}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedStack(null);
                  const checkboxes = Array.from(
                    document.querySelectorAll(
                      '.system-panel input[type="checkbox"][data-stack]'
                    )
                  ) as HTMLInputElement[];
                  checkboxes.forEach((c) => (c.checked = false));
                  const select = document.getElementById(
                    "create-stack"
                  ) as HTMLSelectElement | null;
                  if (select) select.value = "";
                  guessTargetFromSelection();
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>

        <div className="settings-row">
          <label>{t("createService.containers")}</label>
          <div className="containers-grid">
            {availableContainers.map((c) => (
              <label key={c.id} className="container-chip">
                <input
                  type="checkbox"
                  value={c.name}
                  data-stack={c.stack || ""}
                  onChange={guessTargetFromSelection}
                />
                <span className="container-name">{c.name}</span>
                {c.stack && <span className="container-stack">{c.stack}</span>}
              </label>
            ))}
          </div>
          <div className="settings-help">
            {t("createService.containerHelp")}
          </div>
        </div>

        <div className="settings-row">
          <label>{t("createService.mode")}</label>
          <CustomDropdown
            id="create-mode"
            value={mode}
            options={[
              { value: "on_demand", label: t("createService.modeOnDemand") },
              { value: "schedule_only", label: t("createService.modeScheduleOnly") },
              { value: "both", label: t("createService.modeBoth") },
            ]}
            onChange={(value) => {
              setMode(value as "on_demand" | "schedule_only" | "both");
              setIdleTimeoutError(null);
              setStartupTimeoutError(null);
            }}
            placeholder={t("createService.modeOnDemand")}
          />
        </div>


        <div className="settings-row">
          <label>{t("createService.targetUrl")}</label>
          <input
            id="create-target"
            type="text"
            placeholder="http://127.0.0.1:9980"
          />
          <div className="settings-help">
            {t("serviceCard.targetUrlHelp")}
            <code> http://127.0.0.1:9980</code>.
          </div>
        </div>

        {showIdleTimeout && (
          <div className="settings-row">
            <label>{t("createService.idleTimeout")}</label>
            <input
              id="create-idle"
              type="text"
              defaultValue="15m"
              onChange={(e) => {
                const value = e.target.value.trim();
                if (value && !isValidGoDuration(value)) {
                  setIdleTimeoutError(t("createService.errors.idleTimeoutInvalid"));
                } else {
                  setIdleTimeoutError(null);
                }
              }}
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


        {showSchedule && (
          <Fragment>
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
                    >
                      <span className="weekday-chip-dot" />
                      <span className="weekday-chip-label">{d.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="settings-help">
                {t("createService.weekdaysHelp")}
              </div>
            </div>

            <div className="settings-row">
              <label>{t("createService.timeWindow")}</label>
              <div className="settings-inline">
                <input
                  id="create-start"
                  type="time"
                  step={60 * 5}
                />
                <span>—</span>
                <input
                  id="create-stop"
                  type="time"
                  step={60 * 5}
                />
              </div>
              <div className="settings-help">
                {t("createService.timeWindowHelp")}
              </div>
            </div>
          </Fragment>
        )}

        <button
          type="button"
          className="link-button"
          onClick={handleToggleAdvanced}
        >
          {showAdvancedCreate
            ? t("createService.hideAdvancedSettings")
            : t("createService.advancedSettings")}
        </button>

        <div
          ref={advancedWrapperRef}
          className={
            "advanced-settings-section " +
            (showAdvancedCreate ? "advanced-settings-open" : "advanced-settings-closed")
          }
        >
          <div className="advanced-settings-inner">
            <div className="settings-row">
              <label>{t("createService.startupTimeout")}</label>
              <input
                id="create-startup"
                type="text"
                defaultValue="60s"
                onChange={(e) => {
                  const value = e.target.value.trim();
                  if (value && !isValidGoDuration(value)) {
                    setStartupTimeoutError(t("createService.errors.startupTimeoutInvalid"));
                  } else {
                    setStartupTimeoutError(null);
                  }
                }}
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

            <div className="settings-row">
              <label>{t("createService.healthCheckPath")}</label>
              <input id="create-health" type="text" placeholder="/" defaultValue="/" />
              <div className="settings-help">
                {t("serviceCard.healthPathHelp")}
                <code> /</code> {t("serviceCard.healthPathHelp2")} <code>/health</code>. {t("serviceCard.healthPathHelp3")}
              </div>
            </div>
          </div>
        </div>

        {createError && <div className="error-text">{createError}</div>}

        {showProxyNotification && (
          <div className="proxy-notification">
            <div className="proxy-notification-content">
              <strong>{t("createService.proxyNotification.title")}</strong>
              <p>{t("createService.proxyNotification.message")}</p>
              {onNavigateToHelp && (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setShowAdvancedCreate(false);
                    setCreateError(null);
                    onNavigateToHelp();
                    handleClose();
                    setTimeout(() => {
                      onCreated();
                    }, 300);
                  }}
                >
                  {t("createService.proxyNotification.viewHelp")}
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginTop: "8px" }}
                onClick={() => {
                  setShowAdvancedCreate(false);
                  setCreateError(null);
                  handleClose();
                  setTimeout(() => {
                    onCreated();
                  }, 300);
                }}
              >
                {t("createService.proxyNotification.close")}
              </button>
            </div>
          </div>
        )}

        <div className="system-footer">
          {!showProxyNotification && (
            <>
              <button className="btn btn-secondary" onClick={handleClose}>
                {t("createService.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
              setCreateError(null);
              setIdleTimeoutError(null);
              setStartupTimeoutError(null);


              const nameInput = document.getElementById(
                "create-name"
              ) as HTMLInputElement;
              const hostInput = document.getElementById(
                "create-host"
              ) as HTMLInputElement;
              const targetInput = document.getElementById(
                "create-target"
              ) as HTMLInputElement | null;
              const idleInput = document.getElementById(
                "create-idle"
              ) as HTMLInputElement | null;
              const startupInput = document.getElementById(
                "create-startup"
              ) as HTMLInputElement;
              const healthInput = document.getElementById(
                "create-health"
              ) as HTMLInputElement | null;
              const startInput = document.getElementById(
                "create-start"
              ) as HTMLInputElement | null;
              const stopInput = document.getElementById(
                "create-stop"
              ) as HTMLInputElement | null;

              const checkboxes = Array.from(
                document.querySelectorAll(
                  '.system-panel input[type="checkbox"][value]'
                )
              ) as HTMLInputElement[];

              const containersSelected = checkboxes
                .filter((c) => c.checked)
                .map((c) => c.value);

              if (!nameInput.value.trim()) {
                setCreateError(t("createService.errors.nameRequired"));
                return;
              }
              const hostValue = hostInput.value.trim();

              if (mode !== "schedule_only") {
                if (!hostValue) {
                  setCreateError(t("createService.errors.hostRequired"));
                  return;
                }
                if (!isValidHost(hostValue)) {
                  setCreateError(t("createService.errors.hostInvalid"));
                  return;
                }
              } else if (hostValue && !isValidHost(hostValue)) {
                setCreateError(t("createService.errors.hostInvalid"));
                return;
              }
              const targetValue = (targetInput?.value || "").trim();

              if (mode !== "schedule_only") {
                if (!targetValue) {
                  setCreateError(t("createService.errors.targetRequired"));
                  return;
                }
                if (!isValidURL(targetValue)) {
                  setCreateError(t("createService.errors.targetInvalid"));
                  return;
                }
              } else if (targetValue && !isValidURL(targetValue)) {
                setCreateError(t("createService.errors.targetInvalid"));
                return;
              }
              if (!containersSelected.length) {
                setCreateError(t("createService.errors.containersRequired"));
                return;
              }

              const idleValue = (idleInput?.value || "").trim();

              if (
                mode !== "schedule_only" &&
                idleValue &&
                !isValidGoDuration(idleValue)
              ) {
                setCreateError(t("createService.errors.idleTimeoutInvalid"));
                return;
              }
              if (
                startupInput.value.trim() &&
                !isValidGoDuration(startupInput.value)
              ) {
                setCreateError(t("createService.errors.startupTimeoutInvalid"));
                return;
              }

              let schedule: any = undefined;

              if (mode === "schedule_only" || mode === "both") {
                const rawStart = (startInput?.value || "").trim();
                const rawStop = (stopInput?.value || "").trim();

                if (rawStart && !isValidHHMM(rawStart)) {
                  setCreateError(t("createService.errors.startTimeInvalid"));
                  return;
                }
                if (rawStop && !isValidHHMM(rawStop)) {
                  setCreateError(t("createService.errors.stopTimeInvalid"));
                  return;
                }

                const daysEffective =
                  localDays.length > 0 ? localDays : ALL_WEEK_DAY_KEYS;

                const daysArr =
                  daysEffective.length === ALL_WEEK_DAY_KEYS.length
                    ? []
                    : daysEffective;

                if (rawStart || rawStop || daysArr.length) {
                  schedule = {
                    days: daysArr,
                    start: rawStart,
                    stop: rawStop,
                  };
                }
              }

              let healthPath: string;


              if (healthInput === null) {
                healthPath = "/";
              } else {
                healthPath = healthInput.value.trim();
              }

              if (healthPath && !healthPath.startsWith("/")) {
                setCreateError(t("createService.errors.healthPathInvalid"));
                return;
              }



              const body: any = {
                name: nameInput.value.trim(),
                host: hostValue,
                containers: containersSelected,
                startupTimeout: startupInput.value.trim() || "60s",
                mode,
                healthPath,
              };

              if (targetValue) {
                body.targetUrl = targetValue;
              }

              if (mode !== "schedule_only") {
                body.idleTimeout = idleValue || "15m";
              }

              if (schedule) {
                body.schedule = schedule;
              }

              try {
                const res = await fetch("/api/services", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                });
                if (!res.ok) {
                  const text = await res.text();
                  setCreateError(
                    text || t("createService.errors.apiError")
                  );
                  return;
                }
                
                // Check if both targetUrl and host are filled - show proxy notification
                if (targetValue && hostValue) {
                  setShowProxyNotification(true);
                  setCreateError(null);
                  // Don't close automatically - let user see the notification and optionally navigate to help
                  // User can close manually or click the help button
                } else {
                  setShowAdvancedCreate(false);
                  setCreateError(null);
                  handleClose();
                  setTimeout(() => {
                    onCreated();
                  }, 300);
                }
              } catch (e) {
                console.error(e);
                setCreateError(t("createService.errors.networkError"));
              }
            }}
          >
            {t("createService.create")}
          </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateServiceModal;