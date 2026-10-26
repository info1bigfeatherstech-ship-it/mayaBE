import type { Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";
import { Admin } from "../models/Admin";
import { ApiError } from "../utils/ApiError";
import type { LoginInput } from "../validators/auth.validator";

export async function seedAdminUser(): Promise<void> {
  const email = env.ADMIN_EMAIL.toLowerCase();
  const existing = await Admin.findOne({ email }).select("+password tokenVersion");

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
  const email = input.email.toLowerCase();
  const admin = await Admin.findOne({ email }).select("+password tokenVersion");

  if (!admin) {
    throw new ApiError(401, "Invalid email or password");
  }

  const matches = await bcrypt.compare(input.password, admin.password);
  if (!matches) {
    throw new ApiError(401, "Invalid email or password");
  }

  const token = jwt.sign(
    { id: String(admin._id), email: admin.email, ver: admin.tokenVersion || 0 },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN } as SignOptions
  );

  return {
    token,
    admin: {
      id: String(admin._id),
      email: admin.email,
    },
  };
}

export function cookieOptions() {
  const isProd = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: (isProd ? "none" : "lax") as "none" | "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api",
  };
}

export function clearAuthCookies(res: Response) {
  const base = cookieOptions();
  res.clearCookie("maya_admin_token", { ...base, path: "/api" });
  res.clearCookie("maya_admin_token", { ...base, path: "/" });
}
