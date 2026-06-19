// Storage backends for user documents (lorebooks, user cards).

export type StorageMode =
  | "local"
  | "server"
  | "custom"
  | "gdrive"
  | "onedrive"
  | "dropbox"
  | "webdav";

const MODE_KEY = "storage_mode_v1";
const CUSTOM_KEY = "storage_custom_cloud_v1";
const WEBDAV_KEY = "storage_webdav_v1";

export type CustomCloudConfig = {
  url: string;
  anonKey: string;
  email: string;
  password: string;
};

export type WebDAVConfig = {
  baseUrl: string; // e.g. https://cloud.example.com/remote.php/dav/files/user
  username: string;
  password: string;
  folder: string; // sub-folder inside baseUrl
};

const EMPTY_CUSTOM: CustomCloudConfig = { url: "", anonKey: "", email: "", password: "" };
const EMPTY_WEBDAV: WebDAVConfig = { baseUrl: "", username: "", password: "", folder: "st-cs" };

const VALID_MODES: StorageMode[] = ["local", "custom", "gdrive", "onedrive", "dropbox", "webdav"];

export function getStorageMode(): StorageMode {
  if (typeof window === "undefined") return "local";
  const v = localStorage.getItem(MODE_KEY) as StorageMode | null;
  return v && VALID_MODES.includes(v) ? v : "local";
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

export function getWebDAVConfig(): WebDAVConfig {
  if (typeof window === "undefined") return EMPTY_WEBDAV;
  try {
    const raw = localStorage.getItem(WEBDAV_KEY);
    return raw ? { ...EMPTY_WEBDAV, ...JSON.parse(raw) } : EMPTY_WEBDAV;
  } catch {
    return EMPTY_WEBDAV;
  }
}

export function setWebDAVConfig(cfg: WebDAVConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WEBDAV_KEY, JSON.stringify(cfg));
  window.dispatchEvent(new Event("storage-mode-change"));
}

export function onStorageModeChange(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage-mode-change", cb);
  return () => window.removeEventListener("storage-mode-change", cb);
}
