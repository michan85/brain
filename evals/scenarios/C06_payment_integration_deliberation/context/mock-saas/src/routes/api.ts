import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth";
import { User } from "../models/user";
import { pool } from "../db/connection";

const router = Router();

// ─── Health ──────────────────────────────────────────────────────────────────

router.get("/api/v1/health", (_req: Request, res: Response) => {
  res.json({ data: { status: "ok", timestamp: new Date().toISOString() }, error: null, meta: {} });
});

// ─── Users ───────────────────────────────────────────────────────────────────

router.get("/api/v1/users/me", authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query("SELECT id, email, name, plan_tier, created_at FROM users WHERE id = $1", [
      req.userId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ data: null, error: "User not found", meta: {} });
    }
    res.json({ data: result.rows[0], error: null, meta: {} });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message, meta: {} });
  }
});

router.patch("/api/v1/users/me", authenticateToken, async (req: Request, res: Response) => {
  const { name, email } = req.body;
  try {
    const result = await pool.query(
      "UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING id, email, name, plan_tier, created_at",
      [name, email, req.userId]
    );
    res.json({ data: result.rows[0], error: null, meta: {} });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message, meta: {} });
  }
});

// ─── Projects ────────────────────────────────────────────────────────────────

router.get("/api/v1/projects", authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT id, name, description, created_at, updated_at FROM projects WHERE owner_id = $1 ORDER BY updated_at DESC",
      [req.userId]
    );
    res.json({ data: result.rows, error: null, meta: { count: result.rows.length } });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message, meta: {} });
  }
});

router.post("/api/v1/projects", authenticateToken, async (req: Request, res: Response) => {
  const { name, description } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO projects (owner_id, name, description) VALUES ($1, $2, $3) RETURNING id, name, description, created_at, updated_at",
      [req.userId, name, description]
    );
    res.status(201).json({ data: result.rows[0], error: null, meta: {} });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message, meta: {} });
  }
});

router.get("/api/v1/projects/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT id, name, description, created_at, updated_at FROM projects WHERE id = $1 AND owner_id = $2",
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ data: null, error: "Project not found", meta: {} });
    }
    res.json({ data: result.rows[0], error: null, meta: {} });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message, meta: {} });
  }
});

router.delete("/api/v1/projects/:id", authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await pool.query("DELETE FROM projects WHERE id = $1 AND owner_id = $2 RETURNING id", [
      req.params.id,
      req.userId,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ data: null, error: "Project not found", meta: {} });
    }
    res.json({ data: { deleted: true }, error: null, meta: {} });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message, meta: {} });
  }
});

// ─── Usage Events (read-only analytics) ──────────────────────────────────────

router.get("/api/v1/usage", authenticateToken, async (req: Request, res: Response) => {
  const { start_date, end_date } = req.query;
  try {
    const result = await pool.query(
      `SELECT event_type, COUNT(*) as count, DATE(created_at) as date
       FROM usage_events
       WHERE user_id = $1
         AND created_at >= COALESCE($2::timestamp, NOW() - INTERVAL '30 days')
         AND created_at <= COALESCE($3::timestamp, NOW())
       GROUP BY event_type, DATE(created_at)
       ORDER BY date DESC`,
      [req.userId, start_date, end_date]
    );
    res.json({ data: result.rows, error: null, meta: { count: result.rows.length } });
  } catch (err: any) {
    res.status(500).json({ data: null, error: err.message, meta: {} });
  }
});

// NOTE: No payment/billing/subscription endpoints exist yet.
// NOTE: No webhook handling endpoints exist. All routes are synchronous request-response.

export default router;
