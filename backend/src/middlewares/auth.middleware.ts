import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { Admin } from "../models/Admin";
import {
  ADMIN_COOKIE,
  clearAuthCookies,
  type AdminTokenPayload,
} from "../services/auth.service";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";

function readToken(req: Request): string {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const cookie = typeof req.cookies?.[ADMIN_COOKIE] === "string" ? req.cookies[ADMIN_COOKIE].trim() : "";
  return bearer || cookie;
}

function failAuth(res: Response, required: boolean, status: number, message: string) {
  if (!required) return false;
  clearAuthCookies(res);
  throw new ApiError(status, message);
}

async function attachAdmin(req: Request, res: Response, required: boolean) {
  const token = readToken(req);
  if (!token) {
    failAuth(res, required, 401, "Please log in to continue");
    return;
  }

  let decoded: AdminTokenPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as AdminTokenPayload;
  } catch {
    failAuth(res, required, 401, "Session expired. Please log in again");
    return;
  }

  const id = String(decoded?.id || "").trim();
  const email = String(decoded?.email || "").trim().toLowerCase();
  if (!id || !email) {
    failAuth(res, required, 401, "Invalid session");
    return;
  }

  const admin = await Admin.findById(id).select("email tokenVersion");
  if (!admin?.email) {
    failAuth(res, required, 401, "Invalid session");
    return;
  }

  if (admin.email.toLowerCase() !== email) {
    failAuth(res, required, 401, "Invalid session");
    return;
  }

  if ((decoded.ver ?? 0) !== (admin.tokenVersion || 0)) {
    failAuth(res, required, 401, "Session expired. Please log in again");
    return;
  }

  req.admin = { id: String(admin._id), email: admin.email };
}

export const requireAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  await attachAdmin(req, res, true);
  next();
});

export const optionalAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  await attachAdmin(req, res, false);
  next();
});
