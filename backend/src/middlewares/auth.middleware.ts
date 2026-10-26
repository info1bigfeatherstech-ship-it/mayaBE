import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { Admin } from "../models/Admin";
import { ApiError } from "../utils/ApiError";
import { asyncHandler } from "../utils/asyncHandler";

interface TokenPayload {
  id: string;
  email: string;
  ver?: number;
}

function readToken(req: Request): string {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return bearer || req.cookies?.maya_admin_token || "";
}

async function attachAdmin(req: Request, required: boolean) {
  const token = readToken(req);
  if (!token) {
    if (required) throw new ApiError(401, "Please log in to continue");
    return;
  }

  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch {
    if (required) throw new ApiError(401, "Session expired. Please log in again");
    return;
  }

  if (!decoded?.id || !decoded?.email) {
    if (required) throw new ApiError(401, "Invalid session");
    return;
  }

  const admin = await Admin.findById(decoded.id).select("email tokenVersion");
  if (!admin) {
    if (required) throw new ApiError(401, "Invalid session");
    return;
  }

  if ((decoded.ver ?? 0) !== (admin.tokenVersion || 0)) {
    if (required) throw new ApiError(401, "Session expired. Please log in again");
    return;
  }

  req.admin = { id: String(admin._id), email: admin.email };
}

export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  await attachAdmin(req, true);
  next();
});

export const optionalAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  await attachAdmin(req, false);
  next();
});
