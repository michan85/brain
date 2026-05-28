/**
 * Notification API routes.
 *
 * These routes handle reading and marking notifications -- they are
 * SEND-ONLY / READ-ONLY. There are no endpoints for managing notification
 * preferences because no preference system exists.
 */

import { z } from "zod";

type Handler = (req: Request, params: Record<string, string>) => Promise<Response>;

/**
 * GET /api/v1/users/:id/notifications
 * List notifications for a user, newest first. Supports pagination.
 * Returns all notification types -- there is no filtering by preference.
 */
export const listNotifications: Handler = async (req, params) => {
  const db = (req as any).db;
  const userId = params.id;

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
  const unreadOnly = url.searchParams.get("unread") === "true";

  const whereClause = unreadOnly
    ? "WHERE user_id = $1 AND read = false"
    : "WHERE user_id = $1";

  const rows = await db.query(
    `SELECT * FROM notifications ${whereClause}
     ORDER BY sent_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  const countRows = await db.query(
    `SELECT COUNT(*) as total FROM notifications ${whereClause}`,
    [userId]
  );

  return new Response(
    JSON.stringify({
      data: rows,
      meta: {
        total: parseInt(countRows[0].total, 10),
        limit,
        offset,
        // NOTE: No preference data is returned because none exists.
        // The client has no way to know which notifications the user
        // actually wants to receive.
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

/**
 * PATCH /api/v1/users/:id/notifications/:notificationId
 * Mark a single notification as read/unread.
 */
export const updateNotification: Handler = async (req, params) => {
  const db = (req as any).db;
  const { id: userId, notificationId } = params;

  const UpdateSchema = z.object({
    read: z.boolean(),
  });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Validation failed" }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }

  const rows = await db.query(
    `UPDATE notifications SET read = $1
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [parsed.data.read, notificationId, userId]
  );

  if (rows.length === 0) {
    return new Response(
      JSON.stringify({ error: "Notification not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ data: rows[0] }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

/**
 * POST /api/v1/users/:id/notifications/mark-all-read
 * Mark all notifications as read for a user.
 */
export const markAllRead: Handler = async (req, params) => {
  const db = (req as any).db;
  const userId = params.id;

  const result = await db.query(
    `UPDATE notifications SET read = true
     WHERE user_id = $1 AND read = false`,
    [userId]
  );

  return new Response(
    JSON.stringify({
      data: { message: "All notifications marked as read" },
      meta: { updated: result.rowCount ?? 0 },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

// NOTE: There are NO routes for:
// - GET /api/v1/users/:id/notification-preferences
// - PATCH /api/v1/users/:id/notification-preferences
// - POST /api/v1/users/:id/notification-preferences/unsubscribe-all
//
// Users cannot control which notifications they receive or on which channels.
// All 7 notification types fire on both email and in-app for every user.
