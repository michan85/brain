import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ACCESS_TOKEN_EXPIRY = "15m";
const REFRESH_TOKEN_EXPIRY = "7d";

// Extend Express Request to include userId
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * JWT authentication middleware.
 *
 * Validates the Bearer token from the Authorization header.
 * Sets req.userId on success.
 *
 * NOTE: This is a flat authentication check — there is no role-based access
 * control (RBAC). Every authenticated user has identical permissions. There
 * is no concept of "admin", "billing_admin", or "owner" roles. Any
 * authenticated user who knows another user's ID could theoretically
 * access endpoints scoped to that user if the route does not explicitly
 * filter by req.userId.
 */
export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ data: null, error: "Missing or invalid authorization header", meta: {} });
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; iat: number; exp: number };
    req.userId = payload.sub;
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ data: null, error: "Token expired", meta: {} });
    }
    return res.status(403).json({ data: null, error: "Invalid token", meta: {} });
  }
}

/**
 * Generate an access token (short-lived, 15 minutes).
 */
export function generateAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/**
 * Generate a refresh token (long-lived, 7 days).
 * Stored in httpOnly cookie — not in localStorage or response body.
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

/**
 * Set refresh token as httpOnly cookie on the response.
 */
export function setRefreshCookie(res: Response, token: string) {
  res.cookie("refresh_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/api/v1/auth/refresh",
  });
}

// NOTE: No RBAC middleware exists. There are no role checks, no permission
// guards, and no concept of resource ownership beyond manual req.userId
// filtering in individual route handlers. Adding billing/subscription
// management endpoints without RBAC means any authenticated user could
// potentially manage any other user's subscription.
