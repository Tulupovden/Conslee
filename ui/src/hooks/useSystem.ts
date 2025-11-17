import { useState, useEffect } from "react";
import type { SystemStatus } from "../types";

/**
 * Custom hook for fetching and managing system status
 */
export function useSystem() {
  const [system, setSystem] = useState<SystemStatus | null>(null);

  const fetchSystem = async () => {
    try {
      const res = await fetch("/api/system");
      if (!res.ok) return;
      const data = await res.json();
      setSystem(data);
    } catch (e) {
      console.error("Failed to load system settings", e);
    }
  };

  useEffect(() => {
    fetchSystem();

    const id = setInterval(fetchSystem, 10000);

    return () => {
      clearInterval(id);
    };
  }, []);

  return { system, refetch: fetchSystem };
}

