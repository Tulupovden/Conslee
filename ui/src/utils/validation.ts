export const isValidHost = (s: string): boolean => {
    const host = s.trim();
    if (!host) return false;
    if (host === "localhost") return true;
    // no spaces or slashes
    if (/[\/\s]/.test(host)) return false;
    // must be labels separated by dots, labels 1-63 chars, no leading/trailing hyphen
    const labels = host.split(".");
    if (labels.length < 2) return false;
    return labels.every((lbl) =>
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(lbl),
    );
  };
  
  export const isValidURL = (s: string): boolean => {
    try {
      const u = new URL(s);
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  };
  
  export const isValidGoDuration = (s: string): boolean =>
    // Matches Go duration like 500ms, 2s, 1m30s, 1h2m3s, 250us, 10ns
    // Units: ns, us, µs, ms, s, m, h
    /^\d+(ns|us|µs|ms|s|m|h)(\d+(ns|us|µs|ms|s|m|h))*$/.test(s.trim());
  
  export const isValidHHMM = (s: string): boolean =>
    /^([01]\d|2[0-3]):([0-5]\d)$/.test(s.trim());
  
  export const normalizeDays = (s: string): string[] =>
    s
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
  
  export const areValidDays = (arr: string[]): boolean =>
    arr.every((d) =>
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].includes(d),
    );