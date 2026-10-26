import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";

type Bucket = {
  count: number;
  resetAt: number;
};

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const buckets = new Map<string, Bucket>();

function clientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function pruneBuckets(now: number) {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function loginRateLimit(req: Request, _res: Response, next: NextFunction) {
  const now = Date.now();
  pruneBuckets(now);

  const key = clientKey(req);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    next();
    return;
  }

  current.count += 1;
  if (current.count > MAX_ATTEMPTS) {
    next(new ApiError(429, "Too many login attempts. Try again in 15 minutes"));
    return;
  }

  next();
}
