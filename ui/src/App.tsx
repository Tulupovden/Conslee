import React, { useState, useMemo } from "react";

import type {
  ServiceStatus,
  SystemStatus,
  Tab,
} from "./types";

import SystemSettingsModal from "./components/SystemSettingsModal";
import CreateServiceModal from "./components/CreateServiceModal";
import SupportModal from "./components/SupportModal";
import Sidebar from "./components/Sidebar";
import MainHeader from "./components/MainHeader";
import { guessTargetFromSelectionImpl } from "./utils/guessTargetFromSelection"
import ServiceList from "./components/ServiceList";
import HelpPage from "./components/HelpPage";
import { useI18n } from "./i18n/I18nContext";
import { useServices } from "./hooks/useServices";
import { useSystem } from "./hooks/useSystem";
import { useContainers } from "./hooks/useContainers";

const App: React.FC = () => {
  const { t } = useI18n();
  
  // Data hooks
  const { services, loading, refetch: fetchServices } = useServices();
  const { system, refetch: fetchSystem } = useSystem();
  const { containers } = useContainers();
  
  // UI state
  const [tab, setTab] = useState<Tab>("all");
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") {
      return saved;
    }
    return "dark";
  });
  const [editing, setEditing] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const stacks = useMemo(
    () => Array.from(new Set(containers.map((c) => c.stack).filter(Boolean))) as string[],
    [containers]
  );
  const [showCreate, setShowCreate] = useState(false);
  const [showAdvancedCreate, setShowAdvancedCreate] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedStack, setSelectedStack] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  
  const busyContainers = useMemo(
    () => Array.from(new Set(services.flatMap(s => s.containers))),
    [services]
  );

  const saveSystem = async (patch: Partial<SystemStatus>) => {
    if (!system) return;

    const body: any = {};
    if (patch.listenAddr !== undefined) body.listenAddr = patch.listenAddr;
    if (patch.idleReaperInterval !== undefined) {
      body.idleReaperInterval = patch.idleReaperInterval;
    }

    try {
      await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      
      // If listenAddr changed, wait for server restart and redirect to new port
      if (patch.listenAddr !== undefined && patch.listenAddr !== system.listenAddr) {
        const newAddr = patch.listenAddr;
        // Extract port from listenAddr (e.g., ":8800" or "0.0.0.0:8800")
        let port = "";
        if (newAddr.startsWith(":")) {
          port = newAddr.substring(1);
        } else if (newAddr.includes(":")) {
          const parts = newAddr.split(":");
          port = parts[parts.length - 1];
        }
        
        if (port) {
          // Wait for server restart (3 seconds)
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Get current host and protocol
          const currentHost = window.location.hostname;
          const currentProtocol = window.location.protocol;
          const currentPath = window.location.pathname;
          const currentSearch = window.location.search;
          const currentHash = window.location.hash;
          // Redirect to new port, preserving path, query and hash
          window.location.href = `${currentProtocol}//${currentHost}:${port}${currentPath}${currentSearch}${currentHash}`;
          return;
        }
      }
      
      await fetchSystem();
    } catch (e) {
      console.error("Failed to update system settings", e);
    }
  };

  // Service actions

  const filtered = services
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((s) => {
      if (tab === "running") return s.running;
      if (tab === "scheduled") return !!s.schedule;
      return true;
    });

  const handleStart = async (name: string) => {
    await fetch(`/api/services/${encodeURIComponent(name)}/start`, {
      method: "POST",
    });
    fetchServices();
  };

  const handleStop = async (name: string) => {
    await fetch(`/api/services/${encodeURIComponent(name)}/stop`, {
      method: "POST",
    });
    fetchServices();
  };

  const handleDelete = async (name: string) => {
    if (!confirm(t("app.deleteConfirm", { name }))) return;
    await fetch(`/api/services/${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    fetchServices();
  };

  const saveSettings = async (
    svc: ServiceStatus,
    patch: {
      mode?: string;
      idleTimeout?: string;
      schedule?: { days?: string[]; start?: string; stop?: string };
      containers?: string[];
      targetUrl?: string;
      healthPath?: string;
      startupTimeout?: string;
      host?: string;
      enabled?: boolean;
    },
  ) => {
    setSaving(true);
    try {
      await fetch(`/api/services/${encodeURIComponent(svc.name)}/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await fetchServices();
    } catch (e) {
      console.error("Failed to update service", e);
    } finally {
      setSaving(false);
    }
  };

  const formatLastActivity = (iso: string) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString();
  };


  const guessTargetFromSelection = () => {
    guessTargetFromSelectionImpl(containers, services);
  };

  return (
    <div className={`app app-${theme}`}>
      <Sidebar
        tab={tab}
        setTab={setTab}
        theme={theme}
        setTheme={(newTheme) => {
          setTheme(newTheme);
          localStorage.setItem("theme", newTheme);
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onShowSupport={() => setShowSupport(true)}
      />

      <main className="main">
        <MainHeader
          loading={loading}
          onShowCreate={() => setShowCreate(true)}
          onShowSystem={() => setShowSystem(true)}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        />

        {tab === "help" ? (
          <HelpPage />
        ) : (
          <ServiceList
            services={filtered}
            loading={loading}
            editing={editing}
            setEditing={setEditing}
            saving={saving}
            onSaveSettings={saveSettings}
            onStart={handleStart}
            onStop={handleStop}
            onDelete={handleDelete}
            formatLastActivity={formatLastActivity}
            allContainers={containers.map((c) => c.name)}
          />
        )}
      </main>

      {showSystem && system && (
        <SystemSettingsModal
          system={system}
          onClose={() => setShowSystem(false)}
          onSave={saveSystem}
        />
      )}

      {showCreate && (
        <CreateServiceModal
          stacks={stacks}
          containers={containers}
          selectedStack={selectedStack}
          setSelectedStack={setSelectedStack}
          showAdvancedCreate={showAdvancedCreate}
          setShowAdvancedCreate={setShowAdvancedCreate}
          createError={createError}
          setCreateError={setCreateError}
          onClose={() => setShowCreate(false)}
          onCreated={fetchServices}
          guessTargetFromSelection={guessTargetFromSelection}
          busyContainers={busyContainers}
          onNavigateToHelp={() => setTab("help")}
        />
      )}

      {showSupport && (
        <SupportModal
          onClose={() => setShowSupport(false)}
        />
      )}
    </div>
  );
};

export default App;
