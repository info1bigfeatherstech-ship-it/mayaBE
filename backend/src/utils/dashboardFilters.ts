import { ApiError } from "./ApiError";

export const DASHBOARD_RANGES = ["7d", "30d", "90d", "ytd", "all"] as const;
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

const RANGE_DAYS: Partial<Record<DashboardRange, number>> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export type ProductMatchQuery = {
  range?: string;
  season?: string;
};

/** Mongo match for product date/season filters used by analytics endpoints. */
export function buildProductMatch(query: ProductMatchQuery): Record<string, unknown> {
  const range = normalizeRange(query.range);
  const season = typeof query.season === "string" ? query.season.trim() : "";
  const match: Record<string, unknown> = {};

  const days = RANGE_DAYS[range];
  if (days) {
    match.createdAt = { $gte: new Date(Date.now() - days * 86_400_000) };
  } else if (range === "ytd") {
    match.createdAt = { $gte: new Date(new Date().getFullYear(), 0, 1) };
  }

  // Only apply when Product.season is present and non-empty in the request.
  if (season) {
    match.season = season;
  }

  return match;
}

export function normalizeRange(raw?: string): DashboardRange {
  const value = (raw || "all").trim().toLowerCase();
  if (!DASHBOARD_RANGES.includes(value as DashboardRange)) {
    throw new ApiError(400, "Invalid range. Allowed: 7d, 30d, 90d, ytd, all");
  }
  return value as DashboardRange;
}

export function parseThreshold(raw: unknown, fallback = 100): number {
  if (raw === undefined || raw === null || raw === "") return fallback;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw new ApiError(400, "Invalid threshold. Must be a non-negative integer");
  }
  const n = Number.parseInt(text, 10);
  if (!Number.isFinite(n) || n < 0) {
    throw new ApiError(400, "Invalid threshold. Must be a non-negative integer");
  }
  return n;
}

export function parseRefreshFlag(raw: unknown): boolean {
  return String(raw || "").trim().toLowerCase() === "true";
}
