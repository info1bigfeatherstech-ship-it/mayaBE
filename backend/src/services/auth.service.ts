import type { CookieOptions, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { Admin } from "../models/Admin";
import { ApiError } from "../utils/ApiError";
import type { LoginInput } from "../validators/auth.validator";

export const ADMIN_COOKIE = "maya_admin_token";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Password is select:false. Use "+password" alone so every other Admin field
 * (email, tokenVersion) still loads. Mixing "+password tokenVersion" becomes an
 * inclusive select and drops email, which signs a cookie that /auth/me rejects.
 */
const WITH_PASSWORD = "+password";

export type AdminSession = {
  id: string;
  email: string;
};

export type AdminTokenPayload = {
  id: string;
  email: string;
  ver: number;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function sessionFromAdmin(admin: { _id: unknown; email?: string }): AdminSession {
  const email = normalizeEmail(admin.email || "");
  const id = String(admin._id || "");
  if (!id || !email) {
    throw new ApiError(500, "Admin account is incomplete");
  }
  return { id, email };
}

function signAdminToken(admin: AdminSession & { tokenVersion?: number }): string {
  const payload: AdminTokenPayload = {
    id: admin.id,
    email: admin.email,
    ver: admin.tokenVersion || 0,
  };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as SignOptions);
}

export async function seedAdminUser(): Promise<void> {
  const email = normalizeEmail(env.ADMIN_EMAIL);
  const existing = await Admin.findOne({ email }).select(WITH_PASSWORD);

  if (!existing) {
    await Admin.create({
      email,
      password: await bcrypt.hash(env.ADMIN_PASSWORD, 12),
      tokenVersion: 0,
    });
    console.log(`Admin account created for ${email}`);
    return;
  }

  const matches = await bcrypt.compare(env.ADMIN_PASSWORD, existing.password);
  if (matches) return;

  existing.password = await bcrypt.hash(env.ADMIN_PASSWORD, 12);
  existing.tokenVersion = (existing.tokenVersion || 0) + 1;
  await existing.save();
  console.log(`Admin password updated for ${email}. Sign in again with the new password.`);
}

export async function loginAdmin(input: LoginInput) {
  const email = normalizeEmail(input.email);
  const admin = await Admin.findOne({ email }).select(WITH_PASSWORD);

  if (!admin) {
    throw new ApiError(401, "Invalid email or password");
  }

  const matches = await bcrypt.compare(input.password, admin.password);
  if (!matches) {
    throw new ApiError(401, "Invalid email or password");
  }

  const session = sessionFromAdmin(admin);
  return {
    token: signAdminToken({ ...session, tokenVersion: admin.tokenVersion || 0 }),
    admin: session,
  };
}

export function cookieOptions(): CookieOptions {
  const isProd = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/api",
  };
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(ADMIN_COOKIE, token, cookieOptions());
}

export function clearAuthCookies(res: Response) {
  const base = cookieOptions();
  res.clearCookie(ADMIN_COOKIE, { ...base, path: "/api" });
  res.clearCookie(ADMIN_COOKIE, { ...base, path: "/" });
}
