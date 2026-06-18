#!/usr/bin/env bash
# Export this project as a pure Vite React SPA + optional Express backend,
# completely free of any @lovable.dev dependencies and TanStack Start / Nitro SSR.
#
# Output directory: dist-selfhost/
#
# After running this script:
#   cd dist-selfhost
#   npm install
#   npm run dev               # local development
#   npm run build             # production build (-> dist/)
#   npm run preview -- --host 0.0.0.0
#   # Optional backend:
#   cd server && npm install && npm run build && node dist/index.js
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/dist-selfhost"

echo "==> Resetting $OUT"
rm -rf "$OUT"
mkdir -p "$OUT"

# ---------------------------------------------------------------------------
# 1. Copy source tree (excluding all server-only / lovable-only files)
# ---------------------------------------------------------------------------
echo "==> Copying source files (stripping server/lovable-only modules)"
rsync -a \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'dist-selfhost' \
  --exclude '.output' \
  --exclude 'bun.lock' \
  --exclude 'bunfig.toml' \
  --exclude 'package-lock.json' \
  --exclude 'package.json' \
  --exclude 'vite.config.ts' \
  --exclude 'index.html' \
  --exclude 'src/server.ts' \
  --exclude 'src/start.ts' \
  --exclude 'src/routeTree.gen.ts' \
  --exclude 'src/integrations/lovable' \
  --exclude 'src/integrations/supabase/auth-attacher.ts' \
  --exclude 'src/integrations/supabase/auth-middleware.ts' \
  --exclude 'src/integrations/supabase/client.server.ts' \
  --exclude 'src/lib/admin.functions.ts' \
  --exclude 'src/lib/config.server.ts' \
  --exclude 'src/lib/lovable-error-reporting.ts' \
  --exclude 'src/lib/error-page.ts' \
  --exclude 'src/lib/api/example.functions.ts' \
  "$ROOT/" "$OUT/"

# Remove now-empty directories
rmdir "$OUT/src/integrations/lovable" 2>/dev/null || true
rmdir "$OUT/src/lib/api"              2>/dev/null || true

# ---------------------------------------------------------------------------
# 2. index.html (Vite SPA entry — references /src/main.tsx)
# ---------------------------------------------------------------------------
cat > "$OUT/index.html" <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SillyTavernEditor</title>
    <meta name="description" content="Edit PNG and JSON data with a character creator, lorebook, and user profile editor." />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
HTML

# ---------------------------------------------------------------------------
# 3. src/main.tsx (SPA bootstrap)
# ---------------------------------------------------------------------------
cat > "$OUT/src/main.tsx" <<'TSX'
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "./styles.css";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient();
const router = createRouter({
  routeTree,
  context: { queryClient },
  scrollRestoration: true,
  defaultPreloadStaleTime: 0,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
TSX

# ---------------------------------------------------------------------------
# 4. Replace src/router.tsx (no longer used by main.tsx but kept for clarity)
# ---------------------------------------------------------------------------
cat > "$OUT/src/router.tsx" <<'TSX'
// Kept for backwards compatibility — main.tsx now creates the router directly.
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();
  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });
};
TSX

# ---------------------------------------------------------------------------
# 5. Rewrite src/routes/__root.tsx — remove SSR shell, HeadContent, Scripts,
#    appCss?url and the lovable-error-reporting import.
# ---------------------------------------------------------------------------
cat > "$OUT/src/routes/__root.tsx" <<'TSX'
import { QueryClient } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
} from "@tanstack/react-router";

import { AdminSettings } from "../components/AdminSettings";
import { UserStorageSettings } from "../components/UserStorageSettings";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

function RootComponent() {
  return (
    <>
      <Outlet />
      <UserStorageSettings />
      <AdminSettings />
      <Toaster />
    </>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});
TSX

# ---------------------------------------------------------------------------
# 6. vite.config.ts (plain Vite + React + Tailwind v4 + TanStack Router plugin)
# ---------------------------------------------------------------------------
cat > "$OUT/vite.config.ts" <<'TS'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import path from "node:path";

export default defineConfig({
  plugins: [
    // Generates src/routeTree.gen.ts from src/routes/** at dev/build time.
    TanStackRouterVite({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "src/routes",
      generatedRouteTree: "src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
  server: { host: true, port: 8080 },
  preview: { host: true, port: 4173 },
  build: { outDir: "dist", sourcemap: false },
});
TS

# ---------------------------------------------------------------------------
# 7. package.json (no @lovable.dev, no @tanstack/react-start, no nitro)
# ---------------------------------------------------------------------------
node - "$ROOT/package.json" "$OUT/package.json" <<'NODE'
const fs = require("node:fs");
const [src, dst] = process.argv.slice(2);
const pkg = JSON.parse(fs.readFileSync(src, "utf8"));

const STRIP = new Set([
  "@lovable.dev/cloud-auth-js",
  "@lovable.dev/vite-tanstack-config",
  "@tanstack/react-start",
  "nitro",
]);

const filter = (obj) =>
  Object.fromEntries(Object.entries(obj || {}).filter(([k]) => !STRIP.has(k)));

const out = {
  name: "selfhost-spa",
  private: true,
  version: "1.0.0",
  type: "module",
  scripts: {
    dev: "vite",
    build: "vite build",
    preview: "vite preview",
    lint: "eslint .",
  },
  dependencies: filter(pkg.dependencies),
  devDependencies: filter(pkg.devDependencies),
};

// @tanstack/router-plugin is dev-only here
if (out.dependencies["@tanstack/router-plugin"]) {
  out.devDependencies["@tanstack/router-plugin"] =
    out.dependencies["@tanstack/router-plugin"];
  delete out.dependencies["@tanstack/router-plugin"];
}

fs.writeFileSync(dst, JSON.stringify(out, null, 2) + "\n");
NODE

# ---------------------------------------------------------------------------
# 8. README
# ---------------------------------------------------------------------------
cat > "$OUT/README-SELFHOST.md" <<'MD'
# Self-Host SPA Export

Pure Vite React SPA, free of any @lovable.dev or TanStack Start / Nitro SSR dependencies.

## Frontend

```bash
npm install
npm run dev                            # http://localhost:8080
npm run build                          # -> dist/
npm run preview -- --host 0.0.0.0      # http://0.0.0.0:4173
```

## Backend (optional)

```bash
cd server
npm install
npm run build
node dist/index.js
```

Configure the frontend to call the backend via the existing API client
(`src/lib/api-client.ts`) — set `VITE_API_BASE_URL` in a `.env` file.

## What was removed vs. the Lovable source project

- `@lovable.dev/cloud-auth-js`, `@lovable.dev/vite-tanstack-config`
- `@tanstack/react-start`, `nitro` (no SSR, no Nitro)
- `src/server.ts`, `src/start.ts`
- `src/integrations/lovable/`
- `src/integrations/supabase/auth-attacher.ts`, `auth-middleware.ts`, `client.server.ts`
- `src/lib/admin.functions.ts`, `config.server.ts`, `lovable-error-reporting.ts`, `error-page.ts`
- `src/lib/api/example.functions.ts`

Routing stays on TanStack Router but is now 100% client-side.
MD

echo ""
echo "==> Export complete: $OUT"
echo "    cd dist-selfhost && npm install && npm run build"
