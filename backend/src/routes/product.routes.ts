import { Router } from "express";
import {
  getProduct,
  getProducts,
  postProduct,
  putProduct,
  removeProduct,
} from "../controllers/product.controller";
import { optionalAuth, requireAuth } from "../middlewares/auth.middleware";
import { productImageUpload } from "../middlewares/upload.middleware";

const router = Router();

router.get("/", optionalAuth, getProducts);
router.get("/:id", optionalAuth, getProduct);
router.post("/", requireAuth, productImageUpload, postProduct);
router.put("/:id", requireAuth, productImageUpload, putProduct);
router.delete("/:id", requireAuth, removeProduct);

export default router;
