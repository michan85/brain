/**
 * Session Cache — Redis-backed session storage
 *
 * Sessions are stored as JSON strings in Redis with a TTL.
 * The serialized format includes `user_id` as a field name.
 *
 * WARNING: There are approximately 50,000 active sessions in Redis at any
 * given time. Each session is a JSON blob containing `user_id`. Any rename
 * of `user_id` must handle the fact that existing serialized sessions
 * still contain the old field name until they expire (TTL: 7 days).
 *
 * Strategy options for rename:
 *  1. Dual-read: check for both `user_id` and `account_id` when deserializing
 *  2. Bulk migration: SCAN + rewrite all keys (risky under load)
 *  3. Wait for natural expiry: 7 days max, but users may lose sessions
 */

import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
const SESSION_PREFIX = "session:";

interface SessionData {
  user_id: string;
  token: string;
  email: string;
  display_name: string;
  ip_address: string;
  user_agent: string;
  permissions: string[];
  expires_at: string;
  created_at: string;
}

/**
 * Create a new session in Redis.
 * The session is stored as JSON.stringify({ user_id, token, ... }).
 */
export async function createSession(data: {
  user_id: string;
  token: string;
  email: string;
  display_name: string;
  ip_address: string;
  user_agent: string;
  permissions: string[];
}): Promise<string> {
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  const sessionData: SessionData = {
    user_id: data.user_id,
    token: data.token,
    email: data.email,
    display_name: data.display_name,
    ip_address: data.ip_address,
    user_agent: data.user_agent,
    permissions: data.permissions,
    expires_at: expiresAt,
    created_at: new Date().toISOString(),
  };

  // Stored as a JSON string — the field name `user_id` is baked into the serialized format
  await redis.set(
    `${SESSION_PREFIX}${sessionId}`,
    JSON.stringify(sessionData),
    "EX",
    SESSION_TTL_SECONDS
  );

  // Also maintain a reverse index: user_id -> set of session IDs
  // This allows us to find all sessions for a user (e.g., for forced logout)
  await redis.sadd(`user_sessions:${data.user_id}`, sessionId);
  await redis.expire(`user_sessions:${data.user_id}`, SESSION_TTL_SECONDS);

  return sessionId;
}

/**
 * Retrieve and deserialize a session from Redis.
 * Returns null if the session doesn't exist or has expired.
 */
export async function getSession(sessionId: string): Promise<SessionData | null> {
  const raw = await redis.get(`${SESSION_PREFIX}${sessionId}`);
  if (!raw) return null;

  const parsed = JSON.parse(raw) as SessionData;

  // Validate session hasn't expired (belt-and-suspenders with Redis TTL)
  if (new Date(parsed.expires_at) < new Date()) {
    await destroySession(sessionId, parsed.user_id);
    return null;
  }

  return parsed;
}

/**
 * Destroy a session — removes from Redis and the user's session set.
 */
export async function destroySession(sessionId: string, userId: string): Promise<void> {
  await redis.del(`${SESSION_PREFIX}${sessionId}`);
  await redis.srem(`user_sessions:${userId}`, sessionId);
}

/**
 * Destroy all sessions for a user (forced logout).
 * Used when a user changes their password or is deactivated.
 */
export async function destroyAllUserSessions(userId: string): Promise<number> {
  const sessionIds = await redis.smembers(`user_sessions:${userId}`);
  if (sessionIds.length === 0) return 0;

  const pipeline = redis.pipeline();
  for (const sid of sessionIds) {
    pipeline.del(`${SESSION_PREFIX}${sid}`);
  }
  pipeline.del(`user_sessions:${userId}`);
  await pipeline.exec();

  return sessionIds.length;
}

/**
 * Refresh a session's TTL. Called on each authenticated request.
 */
export async function touchSession(sessionId: string): Promise<void> {
  await redis.expire(`${SESSION_PREFIX}${sessionId}`, SESSION_TTL_SECONDS);
}

export { redis };
