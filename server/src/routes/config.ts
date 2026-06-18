import { Router } from "express";

export const configRouter = Router();

// GET /api/config - publicly exposes only what the browser needs.
// Google login is handled entirely by Supabase Auth on the frontend, so the
// backend has no OAuth configuration to expose anymore.
configRouter.get("/", (_req, res) => {
  res.json({});
});
