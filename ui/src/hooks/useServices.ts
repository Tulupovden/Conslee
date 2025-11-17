import { useState, useEffect, useRef } from "react";
import type { ServiceStatus } from "../types";

/**
 * Custom hook for fetching and managing services with minimum loading duration
 */
export function useServices() {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const loadingStartTimeRef = useRef<number | null>(null);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setLoadingWithMinDuration = (value: boolean) => {
    if (value) {
      loadingStartTimeRef.current = Date.now();
      setLoading(true);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    } else {
      const elapsed = loadingStartTimeRef.current
        ? Date.now() - loadingStartTimeRef.current
        : 0;
      const minDuration = 300; // 0.3 seconds
      const remaining = Math.max(0, minDuration - elapsed);

      if (remaining > 0) {
        loadingTimeoutRef.current = setTimeout(() => {
          setLoading(false);
          loadingStartTimeRef.current = null;
          loadingTimeoutRef.current = null;
        }, remaining);
      } else {
        setLoading(false);
        loadingStartTimeRef.current = null;
      }
    }
  };

  const fetchServices = async () => {
    try {
      setLoadingWithMinDuration(true);

      const res = await fetch("/api/services");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const raw = await res.json();

      const normalized: ServiceStatus[] = (raw || []).map((s: any) => ({
        name: s.name,
        host: s.host,
        containers: s.containers ?? [],
        mode: s.mode ?? "on_demand",
        enabled: s.enabled ?? true,
        running: !!s.running,
        lastActivity: s.lastActivity ?? "",
        idleTimeout: s.idleTimeout ?? "",
        startupTimeout: s.startupTimeout ?? "",
        targetUrl: s.targetUrl ?? "",
        healthPath: s.healthPath ?? "",
        schedule: s.schedule
          ? {
              mode: s.schedule.mode ?? "on_demand",
              days: s.schedule.days ?? [],
              start: s.schedule.start ?? "",
              stop: s.schedule.stop ?? "",
            }
          : undefined,
      }));

      setServices(normalized);
    } catch (e) {
      console.error("Failed to load services", e);
    } finally {
      setLoadingWithMinDuration(false);
    }
  };

  useEffect(() => {
    fetchServices();

    const id = setInterval(fetchServices, 10000);

    return () => {
      clearInterval(id);
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  return { services, loading, refetch: fetchServices };
}

