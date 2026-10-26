import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

const allowedOrigins = new Set(
  env.CLIENT_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);

export function requireTrustedOrigin(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  const origin = req.headers.origin;
  if (!origin) {
    if (env.NODE_ENV === "production") {
      next(new ApiError(403, "Invalid request origin"));
      return;
    }
    next();
    return;
  }

  if (!allowedOrigins.has(origin)) {
    next(new ApiError(403, "Invalid request origin"));
    return;
  }

  next();
}
