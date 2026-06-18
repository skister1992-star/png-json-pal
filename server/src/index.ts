import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import "./db.js"; // ensure schema + seed run at startup
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { configRouter } from "./routes/config.js";

const PORT = Number(process.env.PORT ?? 3000);
const FRONTEND_DIST = resolve(process.env.FRONTEND_DIST ?? "../dist");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// CORS for dev: allow the Vite dev server to talk to us
if (process.env.NODE_ENV !== "production") {
  app.use(
    cors({
      origin: (origin, cb) => cb(null, true),
      credentials: true,
    }),
  );
}

// --- API ---
app.use("/api/config", configRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// --- Static frontend ---
if (existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(resolve(FRONTEND_DIST, "index.html"));
  });
} else {
  console.warn(
    `[server] FRONTEND_DIST not found at ${FRONTEND_DIST}. ` +
      `Build the frontend first (bun run build) — running in API-only mode.`,
  );
  app.get("/", (_req, res) => {
    res
      .status(200)
      .send(
        "Character Studio API is running. Frontend build (./dist) not found yet — run `bun run build` in the project root.",
      );
  });
}

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] serving frontend from: ${FRONTEND_DIST}`);
  console.log(`[server] default admin password: "root" (change it in the Admin area)`);
});
