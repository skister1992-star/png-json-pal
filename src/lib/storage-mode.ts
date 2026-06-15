// Where to save user documents (lorebooks, user cards).
// - "cloud": this app's Supabase backend (sync across devices, requires login here)
// - "local": browser localStorage only (private to this device/browser)
// - "custom": user-provided Supabase project (their own cloud)

export type StorageMode = "cloud" | "local" | "custom";

const MODE_KEY = "storage_mode_v1";
const CUSTOM_KEY = "storage_custom_cloud_v1";

export type CustomCloudConfig = {
  url: string;
  anonKey: string;
  email: string;
  password: string;
};

const EMPTY_CUSTOM: CustomCloudConfig = { url: "", anonKey: "", email: "", password: "" };

export function getStorageMode(): StorageMode {
  if (typeof window === "undefined") return "cloud";
  const v = localStorage.getItem(MODE_KEY);
  if (v === "local" || v === "custom") return v;
  return "cloud";
}

export function setStorageMode(mode: StorageMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MODE_KEY, mode);
  window.dispatchEvent(new Event("storage-mode-change"));
}

export function getCustomCloudConfig(): CustomCloudConfig {
  if (typeof window === "undefined") return EMPTY_CUSTOM;
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? { ...EMPTY_CUSTOM, ...JSON.parse(raw) } : EMPTY_CUSTOM;
  } catch {
    return EMPTY_CUSTOM;
  }
}

export function setCustomCloudConfig(cfg: CustomCloudConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new Event("storage-mode-change"));
}

export function onStorageModeChange(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage-mode-change", cb);
  return () => window.removeEventListener("storage-mode-change", cb);
}
