/**
 * ACME Platform — REST API v1 Routes
 *
 * These endpoints are consumed by:
 *  - The web frontend (React SPA)
 *  - The mobile app (React Native)
 *  - 12 partner integrations via API keys (see docs/api-reference.md)
 *
 * IMPORTANT: Response shapes are part of the public API contract.
 * Field names must not change without a deprecation cycle.
 */

import { db } from "../db/connection";
import { verifyToken } from "../auth/middleware";
import { redis } from "../cache/session";

// GET /api/v1/users/:id
// Returns the public user profile. Partners use this to look up users.
export function getUser(req: Request): Response {
  const userId = req.params.id;
  const user = db.query(
    `SELECT user_id, email, display_name, created_at FROM users WHERE user_id = $1`,
    [userId]
  );

  if (!user) {
    return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
  }

  // Response shape is documented in api-reference.md
  return Response.json({
    user_id: user.user_id,
    email: user.email,
    name: user.display_name,
    created_at: user.created_at,
  });
}

// GET /api/v1/users/:id/orders
// Returns paginated order history for a user.
export function getUserOrders(req: Request): Response {
  const userId = req.params.id;
  const page = parseInt(req.query.page ?? "1", 10);
  const limit = Math.min(parseInt(req.query.limit ?? "20", 10), 100);
  const offset = (page - 1) * limit;

  const orders = db.query(
    `SELECT order_id, user_id, total_cents, currency, status, created_at
     FROM orders
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  return Response.json({
    user_id: userId,
    orders: orders.map((o: any) => ({
      order_id: o.order_id,
      user_id: o.user_id,
      total_cents: o.total_cents,
      currency: o.currency,
      status: o.status,
      created_at: o.created_at,
    })),
    page,
    limit,
  });
}

// GET /api/v1/me
// Returns the authenticated user's profile. Used by web and mobile clients.
export function getMe(req: Request): Response {
  const session = verifyToken(req);
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const user = db.query(
    `SELECT user_id, email, display_name, created_at, updated_at FROM users WHERE user_id = $1`,
    [session.user_id]
  );

  return Response.json({
    user_id: user.user_id,
    email: user.email,
    name: user.display_name,
    created_at: user.created_at,
    updated_at: user.updated_at,
  });
}

// POST /api/v1/users
// Creates a new user account. Returns the created user with user_id.
export function createUser(req: Request): Response {
  const { email, name, password } = req.body;

  const existing = db.query(`SELECT user_id FROM users WHERE email = $1`, [email]);
  if (existing) {
    return new Response(
      JSON.stringify({ error: "Email already registered", existing_user_id: existing.user_id }),
      { status: 409 }
    );
  }

  const passwordHash = hashPassword(password);
  const newUser = db.query(
    `INSERT INTO users (email, display_name, password_hash)
     VALUES ($1, $2, $3)
     RETURNING user_id, email, display_name, created_at`,
    [email, name, passwordHash]
  );

  return Response.json(
    {
      user_id: newUser.user_id,
      email: newUser.email,
      name: newUser.display_name,
      created_at: newUser.created_at,
    },
    { status: 201 }
  );
}

// GET /api/v1/audit/:user_id
// Returns audit trail for a user. Used by compliance team and partner integrations.
export function getUserAudit(req: Request): Response {
  const userId = req.params.user_id;
  const since = req.query.since ?? new Date(Date.now() - 30 * 86400000).toISOString();

  const logs = db.query(
    `SELECT log_id, user_id, action, resource_type, resource_id, metadata, created_at
     FROM audit_log
     WHERE user_id = $1 AND created_at >= $2
     ORDER BY created_at DESC
     LIMIT 500`,
    [userId, since]
  );

  return Response.json({
    user_id: userId,
    audit_entries: logs.map((l: any) => ({
      log_id: l.log_id,
      user_id: l.user_id,
      action: l.action,
      resource_type: l.resource_type,
      resource_id: l.resource_id,
      metadata: l.metadata,
      timestamp: l.created_at,
    })),
  });
}
