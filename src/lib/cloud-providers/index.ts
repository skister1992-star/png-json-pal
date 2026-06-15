import type { CloudAdapter } from "./types";
import { googleDriveAdapter } from "./gdrive";
import { oneDriveAdapter } from "./onedrive";
import { dropboxAdapter } from "./dropbox";
import { webDavAdapter } from "./webdav";
import { type StorageMode } from "@/lib/storage-mode";

export function getCloudAdapter(mode: StorageMode): CloudAdapter | null {
  switch (mode) {
    case "gdrive":
      return googleDriveAdapter;
    case "onedrive":
      return oneDriveAdapter;
    case "dropbox":
      return dropboxAdapter;
    case "webdav":
      return webDavAdapter;
    default:
      return null;
  }
}

export { connectGoogleDrive, disconnectGoogleDrive } from "./gdrive";
export { connectOneDrive, disconnectOneDrive } from "./onedrive";
export { connectDropbox, disconnectDropbox } from "./dropbox";
export { loadOAuthAppConfig, invalidateOAuthAppConfigCache } from "./app-config";
export type { CloudAdapter, DocRow, TableName } from "./types";
