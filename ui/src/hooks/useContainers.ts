import { useState, useEffect } from "react";
import type { DockerContainer } from "../types";

/**
 * Custom hook for fetching and managing Docker containers
 */
export function useContainers() {
  const [containers, setContainers] = useState<DockerContainer[]>([]);

  const fetchContainers = async () => {
    try {
      const res = await fetch("/api/docker/containers");
      if (!res.ok) return;
      const data = await res.json();
      setContainers(data);
    } catch (e) {
      console.error("Failed to load docker containers", e);
    }
  };

  useEffect(() => {
    fetchContainers();

    const id = setInterval(fetchContainers, 10000);

    return () => {
      clearInterval(id);
    };
  }, []);

  return { containers, refetch: fetchContainers };
}

