// Where to save user documents (lorebooks, user cards).
// - "cloud": Supabase backend (current default, syncs across devices)
// - "local": browser localStorage only (private to this device/browser)

export type StorageMode = "cloud" | "local";

const KEY = "storage_mode_v1";

export function getStorageMode(): StorageMode {
  if (typeof window === "undefined") return "cloud";
  const v = localStorage.getItem(KEY);
  return v === "local" ? "local" : "cloud";
}

export function setStorageMode(mode: StorageMode) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, mode);
  window.dispatchEvent(new Event("storage-mode-change"));
}

export function onStorageModeChange(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage-mode-change", cb);
  return () => window.removeEventListener("storage-mode-change", cb);
}
