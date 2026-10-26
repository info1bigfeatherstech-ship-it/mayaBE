import { Router } from "express";
import authRoutes from "./auth.routes";
import categoryRoutes from "./category.routes";
import customerRoutes from "./customer.routes";
import factoryRoutes from "./factory.routes";
import productRoutes from "./product.routes";

const router = Router();

router.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Maya Exports API is running",
  });
});

router.use("/auth", authRoutes);
router.use("/categories", categoryRoutes);
router.use("/factories", factoryRoutes);
router.use("/customers", customerRoutes);
router.use("/products", productRoutes);

export default router;
