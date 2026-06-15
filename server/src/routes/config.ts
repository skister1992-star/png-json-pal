import { Router } from "express";
import { db } from "../db.js";

export const configRouter = Router();

// GET /api/config - publicly exposes only what the browser needs
configRouter.get("/", (_req, res) => {
  const row = db
    .prepare("SELECT google_client_id FROM oauth_config WHERE id = 1")
    .get() as { google_client_id: string };
  res.json({
    google_login_enabled: !!row?.google_client_id,
  });
});
