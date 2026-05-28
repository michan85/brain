/**
 * Settings API routes.
 *
 * Supports Profile and Security settings. There is no Notifications
 * settings endpoint -- users cannot configure notification preferences.
 */

import { z } from "zod";
import { getUserById, updateUserSettings, UserSettingsUpdateSchema } from "../models/user";

// Middleware type (simplified for mock)
type Handler = (req: Request, params: Record<string, string>) => Promise<Response>;

/**
 * GET /api/v1/users/:id/settings
 * Returns the user's current settings (profile + security metadata).
 */
export const getSettings: Handler = async (req, params) => {
  const db = (req as any).db;
  const userId = params.id;

  const user = await getUserById(db, userId);
  if (!user) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({
      data: {
        profile: {
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url,
          timezone: user.timezone,
        },
        security: {
          // Security settings are read from a separate table in production,
          // but for this mock we return static metadata
          mfa_enabled: false,
          last_password_change: "2026-02-15T00:00:00Z",
          active_sessions: 2,
        },
        // NOTE: No "notifications" key here. There is no notification
        // preferences system. The settings page only has Profile and Security.
      },
      meta: {
        available_sections: ["profile", "security"],
        // "notifications" is not listed -- it does not exist as a section
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

/**
 * PATCH /api/v1/users/:id/settings
 * Partial update for user settings. Only profile fields are supported.
 * There is no notification preferences update endpoint.
 */
export const updateSettings: Handler = async (req, params) => {
  const db = (req as any).db;
  const userId = params.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const parsed = UserSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: parsed.error.issues,
      }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const updated = await updateUserSettings(db, userId, parsed.data);
    return new Response(
      JSON.stringify({
        data: {
          profile: {
            name: updated.name,
            email: updated.email,
            avatar_url: updated.avatar_url,
            timezone: updated.timezone,
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};

/**
 * PATCH /api/v1/users/:id/settings/security
 * Update security-specific settings (password change, MFA toggle).
 */
export const updateSecuritySettings: Handler = async (req, params) => {
  const db = (req as any).db;
  const userId = params.id;

  const SecurityUpdateSchema = z.object({
    current_password: z.string().optional(),
    new_password: z.string().min(8).optional(),
    mfa_enabled: z.boolean().optional(),
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

  const parsed = SecurityUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Validation failed", details: parsed.error.issues }),
      { status: 422, headers: { "Content-Type": "application/json" } }
    );
  }

  // In a real app, this would verify current_password, hash new_password, etc.
  return new Response(
    JSON.stringify({ data: { message: "Security settings updated" } }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
