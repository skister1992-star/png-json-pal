// Shared OAuth helpers (PKCE + popup) for cloud providers.

export type ProviderId = "gdrive" | "onedrive" | "dropbox";

const TOKEN_KEY = (p: ProviderId) => `cloud_token_${p}_v1`;

export type StoredToken = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // ms epoch
  tokenType?: string;
};

export function getStoredToken(p: ProviderId): StoredToken | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TOKEN_KEY(p));
    return raw ? (JSON.parse(raw) as StoredToken) : null;
  } catch {
    return null;
  }
}

export function setStoredToken(p: ProviderId, t: StoredToken | null) {
  if (typeof window === "undefined") return;
  if (!t) localStorage.removeItem(TOKEN_KEY(p));
  else localStorage.setItem(TOKEN_KEY(p), JSON.stringify(t));
  window.dispatchEvent(new Event("cloud-auth-change"));
}

export function isTokenValid(t: StoredToken | null): boolean {
  return !!t && t.expiresAt - 30_000 > Date.now();
}

// ---------- PKCE helpers ----------
function base64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(len = 64) {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return base64url(a).slice(0, len);
}

async function sha256(s: string): Promise<Uint8Array> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return new Uint8Array(buf);
}

export async function createPkce() {
  const verifier = randomString(64);
  const challenge = base64url(await sha256(verifier));
  return { verifier, challenge };
}

// ---------- Popup flow ----------
export type PopupResult =
  | { kind: "code"; code: string; state: string }
  | { kind: "token"; accessToken: string; expiresIn: number; tokenType: string; state: string };

export function openOAuthPopup(authUrl: string, state: string): Promise<PopupResult> {
  return new Promise((resolve, reject) => {
    const w = 520;
    const h = 640;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;
    const popup = window.open(
      authUrl,
      "cloud_oauth",
      `width=${w},height=${h},left=${left},top=${top}`,
    );
    if (!popup) return reject(new Error("Popup blockiert. Bitte Popups erlauben."));

    const handler = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const d = ev.data;
      if (!d || d.type !== "oauth-callback") return;
      if (d.state !== state) {
        cleanup();
        return reject(new Error("OAuth state mismatch"));
      }
      cleanup();
      if (d.error) return reject(new Error(d.error_description || d.error));
      if (d.code) resolve({ kind: "code", code: d.code, state: d.state });
      else if (d.access_token)
        resolve({
          kind: "token",
          accessToken: d.access_token,
          expiresIn: Number(d.expires_in) || 3600,
          tokenType: d.token_type || "Bearer",
          state: d.state,
        });
      else reject(new Error("Keine Antwort vom OAuth-Provider"));
    };

    const interval = setInterval(() => {
      if (popup.closed) {
        cleanup();
        reject(new Error("Anmeldung abgebrochen"));
      }
    }, 500);

    function cleanup() {
      window.removeEventListener("message", handler);
      clearInterval(interval);
      try {
        popup?.close();
      } catch {
        /* ignore */
      }
    }

    window.addEventListener("message", handler);
  });
}

export function redirectUri(): string {
  return window.location.origin + "/oauth-callback";
}
