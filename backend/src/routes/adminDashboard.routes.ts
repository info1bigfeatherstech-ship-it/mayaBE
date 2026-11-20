import { Router } from "express";
import {
  getCategoryDistributionHandler,
  getFactoryWorkloadHandler,
  getInventoryAlertsHandler,
  getMarketAndBuyerAnalyticsHandler,
  getRecentActivityHandler,
  getSummary,
} from "../controllers/adminDashboard.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { dashboardCache } from "../middlewares/dashboardCache.middleware";

const router = Router();

router.use(requireAuth, dashboardCache);

router.get("/summary", getSummary);
router.get("/category-distribution", getCategoryDistributionHandler);
router.get("/market-and-buyer-analytics", getMarketAndBuyerAnalyticsHandler);
router.get("/factory-workload", getFactoryWorkloadHandler);
router.get("/inventory-alerts", getInventoryAlertsHandler);
router.get("/recent-activity", getRecentActivityHandler);

export default router;
