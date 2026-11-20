import type { NextFunction, Request, Response } from "express";

type CacheEntry = {
  expiresAt: number;
  body: unknown;
};

const TTL_MS = 60_000;
const CHECK_MS = 120_000;
const MAX_ENTRIES = 500;

const cache = new Map<string, CacheEntry>();

const janitor = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}, CHECK_MS);
janitor.unref?.();

function cacheKey(req: Request): string {
  const qs = Object.entries(req.query)
    .filter(([key]) => key !== "refresh")
    .map(([key, value]) => {
      const normalized = Array.isArray(value) ? value.join(",") : String(value ?? "");
      return `${key}=${normalized}`;
    })
    .sort()
    .join("&");
  return `${req.baseUrl}${req.path}?${qs}`;
}

export function clearDashboardCache(): void {
  cache.clear();
}

/** In-memory TTL cache for dashboard GETs. Skipped when ?refresh=true. Only caches HTTP 200 JSON. */
export function dashboardCache(req: Request, res: Response, next: NextFunction): void {
  const key = cacheKey(req);
  const refresh = String(req.query.refresh || "").trim().toLowerCase() === "true";

  if (!refresh) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      res.status(200).json(hit.body);
      return;
    }
    if (hit) cache.delete(key);
  }

  const sendJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode === 200) {
      if (cache.size >= MAX_ENTRIES) {
        const first = cache.keys().next().value;
        if (first) cache.delete(first);
      }
      cache.set(key, { body, expiresAt: Date.now() + TTL_MS });
    }
    return sendJson(body);
  }) as Response["json"];

  next();
}
