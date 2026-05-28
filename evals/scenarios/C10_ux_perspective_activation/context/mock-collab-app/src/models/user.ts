import { z } from "zod";

export const PlanTier = z.enum(["free", "pro", "enterprise"]);
export type PlanTier = z.infer<typeof PlanTier>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(255),
  avatar_url: z.string().url().nullable(),
  timezone: z.string().default("UTC"),
  plan_tier: PlanTier.default("free"),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type User = z.infer<typeof UserSchema>;

// Settings that can be updated via PATCH /api/v1/users/:id/settings
export const UserSettingsUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  avatar_url: z.string().url().nullable().optional(),
  timezone: z.string().optional(),
});

export type UserSettingsUpdate = z.infer<typeof UserSettingsUpdateSchema>;

// NOTE: There is no notification preferences field on the user model.
// The notification system sends all types to all users on all channels.
// Users have requested per-type control but it has not been implemented.

export async function getUserById(db: any, id: string): Promise<User | null> {
  const rows = await db.query("SELECT * FROM users WHERE id = $1", [id]);
  if (rows.length === 0) return null;
  return UserSchema.parse(rows[0]);
}

export async function updateUserSettings(
  db: any,
  userId: string,
  settings: UserSettingsUpdate
): Promise<User> {
  const fields: string[] = [];
  const values: any[] = [];
  let idx = 1;

  for (const [key, value] of Object.entries(settings)) {
    if (value !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(value);
      idx++;
    }
  }

  if (fields.length === 0) {
    const user = await getUserById(db, userId);
    if (!user) throw new Error("User not found");
    return user;
  }

  fields.push(`updated_at = now()`);
  values.push(userId);

  const query = `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *`;
  const rows = await db.query(query, values);
  return UserSchema.parse(rows[0]);
}
