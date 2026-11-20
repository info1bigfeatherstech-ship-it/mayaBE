import type { Request, Response } from "express";
import {
  getCategoryDistribution,
  getDashboardSummary,
  getFactoryWorkload,
  getInventoryAlerts,
  getMarketAndBuyerAnalytics,
  getRecentActivity,
} from "../services/adminDashboard.service";
import { successResponse } from "../utils/ApiResponse";
import { asyncHandler } from "../utils/asyncHandler";

function dashboardOk<T>(res: Response, message: string, data: T) {
  res.status(200).json(
    successResponse(message, data, {
      generatedAt: new Date().toISOString(),
    })
  );
}

export const getSummary = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getDashboardSummary();
  dashboardOk(res, "Dashboard summary fetched", data);
});

export const getCategoryDistributionHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getCategoryDistribution({
    range: typeof req.query.range === "string" ? req.query.range : undefined,
    season: typeof req.query.season === "string" ? req.query.season : undefined,
  });
  dashboardOk(res, "Category distribution fetched", data);
});

export const getMarketAndBuyerAnalyticsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getMarketAndBuyerAnalytics({
    range: typeof req.query.range === "string" ? req.query.range : undefined,
    season: typeof req.query.season === "string" ? req.query.season : undefined,
  });
  dashboardOk(res, "Market and buyer analytics fetched", data);
});

export const getFactoryWorkloadHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getFactoryWorkload();
  dashboardOk(res, "Factory workload fetched", data);
});

export const getInventoryAlertsHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = await getInventoryAlerts(req.query.threshold);
  dashboardOk(res, "Inventory alerts fetched", data);
});

export const getRecentActivityHandler = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getRecentActivity();
  dashboardOk(res, "Recent activity fetched", data);
});
