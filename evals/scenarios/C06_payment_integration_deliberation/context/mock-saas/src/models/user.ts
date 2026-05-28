import { pool } from "../db/connection";

export interface User {
  id: string;
  email: string;
  name: string;
  plan_tier: "free" | "pro";
  created_at: Date;
}

// NOTE: No billing-related fields exist on the User model.
// There is no stripe_customer_id, no subscription_id, no billing_address,
// no payment_method_id, and no subscription_status field.

export async function findUserById(id: string): Promise<User | null> {
  const result = await pool.query(
    "SELECT id, email, name, plan_tier, created_at FROM users WHERE id = $1",
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await pool.query(
    "SELECT id, email, name, plan_tier, created_at FROM users WHERE email = $1",
    [email]
  );
  return result.rows[0] ?? null;
}

export async function createUser(data: { email: string; name: string }): Promise<User> {
  const result = await pool.query(
    "INSERT INTO users (email, name, plan_tier) VALUES ($1, $2, 'free') RETURNING id, email, name, plan_tier, created_at",
    [data.email, data.name]
  );
  return result.rows[0];
}

export async function updatePlanTier(userId: string, tier: "free" | "pro"): Promise<User> {
  // Direct plan_tier update — no subscription management, no proration,
  // no Stripe sync. Just flips the enum in the database.
  const result = await pool.query(
    "UPDATE users SET plan_tier = $1 WHERE id = $2 RETURNING id, email, name, plan_tier, created_at",
    [tier, userId]
  );
  return result.rows[0];
}

export async function deleteUser(userId: string): Promise<void> {
  // WARNING: No cleanup of external services (e.g., Stripe customer records)
  // is performed when a user is deleted. If a payment provider customer record
  // exists, it will be orphaned.
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
}
