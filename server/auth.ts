import jwt from "jsonwebtoken";
import bcryptjs from "bcryptjs";
import type { User } from "@shared/schema";

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = "7d";

export interface JWTPayload {
  id: string;
  username: string;
  role: string;
}      

/* ================= PASSWORD ================= */

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcryptjs.genSalt(10);
  return bcryptjs.hash(password, salt);
}

export async function comparePasswords(
  password: string,
  hash: string
): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

/* ================= JWT ================= */

export function generateToken(user: User & { role?: string }): string {
  const payload: JWTPayload = {
    id: user.id,
    username: user.username,
    role: user.role || "user",
  };

  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

/* ================= TOKEN EXTRACT ================= */
/**
 * Accepts:
 *  - "Bearer <token>"
 *  - "bearer <token>"
 *  - "<token>" (fallback)
 */
export function extractTokenFromHeader(
  authHeader: string | undefined
): string | null {
  if (!authHeader) return null;

  const header = authHeader.trim();

  // Handle "Bearer <token>" (case-insensitive)
  if (/^Bearer\s+/i.test(header)) {
    return header.replace(/^Bearer\s+/i, "").trim();
  }

  // Fallback: raw token
  return header;
}
              