import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/oauth-callback")({
  component: OAuthCallback,
});

function OAuthCallback() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params: Record<string, string> = {};
    const url = new URL(window.location.href);
    url.searchParams.forEach((v, k) => (params[k] = v));
    // Also parse hash (#access_token=…) for implicit flows
    if (url.hash && url.hash.length > 1) {
      const hp = new URLSearchParams(url.hash.slice(1));
      hp.forEach((v, k) => {
        if (!(k in params)) params[k] = v;
      });
    }

    try {
      if (window.opener) {
        window.opener.postMessage({ type: "oauth-callback", ...params }, window.location.origin);
      }
    } catch (e) {
      console.warn("postMessage failed", e);
    }
    setTimeout(() => {
      try {
        window.close();
      } catch {
        /* ignore */
      }
    }, 50);
  }, []);

  return (
    <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
      Anmeldung wird abgeschlossen…
    </div>
  );
}
