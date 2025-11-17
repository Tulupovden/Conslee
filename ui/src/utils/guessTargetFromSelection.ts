import type { DockerContainer, ServiceStatus } from "../types";

export const guessTargetFromSelectionImpl = (
  containers: DockerContainer[],
  services: ServiceStatus[],
) => {
  const targetInput = document.getElementById(
    "create-target",
  ) as HTMLInputElement | null;
  if (!targetInput) return;

  const checkboxes = Array.from(
    document.querySelectorAll(
      '.system-panel input[type="checkbox"][value]',
    ),
  ) as HTMLInputElement[];

  const selectedNames = checkboxes
    .filter((c) => c.checked)
    .map((c) => c.value);
  const autofilled = targetInput.dataset.autofilled === "1";
  const autoValue = targetInput.dataset.autofilledValue || "";

  if (selectedNames.length === 0) {
    if (autofilled && targetInput.value === autoValue) {
      targetInput.value = "";
      delete targetInput.dataset.autofilled;
      delete targetInput.dataset.autofilledValue;
    }
    return;
  }

  if (!autofilled && targetInput.value.trim() !== "") return;
  if (autofilled && targetInput.value === autoValue) return;

  const firstName = selectedNames[0];
  let cont = containers.find((c) => c.name === firstName);

  let suggested: string | null = null;

  // Use port from the first selected container only
  if (cont && Array.isArray(cont.ports) && cont.ports.length > 0) {
    for (const p of cont.ports as any[]) {
      if (typeof p === "string") {
        const m = p.match(/^(\d+)->/);
        if (m && parseInt(m[1]) > 0) {
          suggested = `http://127.0.0.1:${parseInt(m[1])}`;
          break;
        }
      } else if (p && typeof p === "object" && Number(p.public) > 0) {
        suggested = `http://127.0.0.1:${p.public}`;
        break;
      }
    }
  }

  // Fallback: use targetUrl from existing service that uses this container
  if (!suggested && services.length > 0) {
    const existing = services.find((s) => s.containers.includes(firstName));
    if (existing && existing.targetUrl) {
      suggested = existing.targetUrl;
    }
  }

  if (!suggested) return;

  targetInput.value = suggested;
  targetInput.dataset.autofilled = "1";
  targetInput.dataset.autofilledValue = suggested;
};