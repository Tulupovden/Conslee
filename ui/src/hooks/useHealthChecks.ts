import { useEffect, useState } from "react";
import type { ServiceStatus } from "../types";

const PROBE_INTERVAL_MS = 10000;

type ProbePayload = {
  url: string;
  expectHost?: string;
  allowWake?: boolean;
  requireSignature?: boolean;
};

type ProbeResponse = {
  status: "healthy" | "unhealthy";
};

const performServerProbe = async (
  payload: ProbePayload,
  controllers: Set<AbortController>,
): Promise<"healthy" | "unhealthy"> => {
  const controller = new AbortController();
  controllers.add(controller);

  try {
    const response = await fetch("/api/probes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      return "unhealthy";
    }

    const data = (await response.json()) as ProbeResponse;
    return data.status === "healthy" ? "healthy" : "unhealthy";
  } catch {
    return "unhealthy";
  } finally {
    controllers.delete(controller);
  }
};

/**
 * Custom hook for checking proxy health (nginx/apache -> app)
 */
export function useProxyHealthCheck(service: ServiceStatus) {
  const [proxyHealth, setProxyHealth] = useState<"healthy" | "unhealthy" | null>(null);

  useEffect(() => {
    if (!service.enabled) {
      setProxyHealth(null);
      return;
    }

    const host = (service.host || "").trim();
    const target = (service.targetUrl || "").trim();

    if (!host || !target) {
      setProxyHealth(null);
      return;
    }

    let cancelled = false;
    const controllers = new Set<AbortController>();
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const healthPath = (service.healthPath || "").trim();
    const normalizedPath = healthPath
      ? healthPath.startsWith("/")
        ? healthPath
        : `/${healthPath}`
      : "/";
    const url = `${protocol}//${host}${normalizedPath}`;
    const expectHost = host.toLowerCase();
    const allowWake = false;

    const runProxyCheck = async () => {
      try {
        const status = await performServerProbe(
          {
            url,
            expectHost,
            allowWake,
            requireSignature: true,
          },
          controllers,
        );
        if (!cancelled) {
          setProxyHealth(status);
        }
      } catch {
        if (!cancelled) {
          setProxyHealth("unhealthy");
        }
      }
    };

    runProxyCheck();
    const intervalId = window.setInterval(runProxyCheck, PROBE_INTERVAL_MS);

    return () => {
      cancelled = true;
      controllers.forEach((controller) => controller.abort());
      window.clearInterval(intervalId);
    };
  }, [service.enabled, service.host, service.targetUrl, service.healthPath]);

  return proxyHealth;
}

/**
 * Custom hook for checking target health (application -> container)
 */
export function useTargetHealthCheck(
  service: ServiceStatus,
  proxyHealth: "healthy" | "unhealthy" | null,
) {
  const [targetHealth, setTargetHealth] = useState<"healthy" | "unhealthy" | null>(null);

  useEffect(() => {
    if (!service.enabled) {
      setTargetHealth(null);
      return;
    }

    if (!service.running) {
      setTargetHealth(null);
      return;
    }

    if (proxyHealth !== "healthy") {
      setTargetHealth(null);
      return;
    }

    const host = (service.host || "").trim();
    const baseTarget = (service.targetUrl || "").trim();

    if (!host || !baseTarget) {
      setTargetHealth(null);
      return;
    }

    let targetToCheck = baseTarget;
    try {
      const baseUrl = new URL(baseTarget);
      const healthPath = (service.healthPath || "").trim();
      if (healthPath) {
        targetToCheck = new URL(
          healthPath.startsWith("/") ? healthPath : `/${healthPath}`,
          baseUrl,
        ).toString();
      } else {
        targetToCheck = baseUrl.toString();
      }
    } catch {
      targetToCheck = baseTarget;
    }

    let cancelled = false;
    const controllers = new Set<AbortController>();
    let expectHost = "";
    try {
      expectHost = new URL(targetToCheck).host.toLowerCase();
    } catch {
      expectHost = "";
    }

    const runTargetCheck = async () => {
      try {
        const status = await performServerProbe(
          {
            url: targetToCheck,
            expectHost,
            allowWake: true,
          },
          controllers,
        );
        if (!cancelled) {
          setTargetHealth(status);
        }
      } catch {
        if (!cancelled) {
          setTargetHealth("unhealthy");
        }
      }
    };

    runTargetCheck();
    const intervalId = window.setInterval(runTargetCheck, PROBE_INTERVAL_MS);

    return () => {
      cancelled = true;
      controllers.forEach((controller) => controller.abort());
      window.clearInterval(intervalId);
    };
  }, [
    service.enabled,
    service.running,
    service.targetUrl,
    service.healthPath,
    service.host,
    proxyHealth,
  ]);

  return targetHealth;
}

