import { Router } from "express";
import {
  getImportTemplate,
  getProduct,
  getProducts,
  postProduct,
  postProductImport,
  putProduct,
  removeProduct,
} from "../controllers/product.controller";
import { optionalAuth, requireAuth } from "../middlewares/auth.middleware";
import { productImageUpload, productImportUpload } from "../middlewares/upload.middleware";

const router = Router();

router.get("/", optionalAuth, getProducts);
router.get("/import/template", requireAuth, getImportTemplate);
router.post("/import", requireAuth, productImportUpload, postProductImport);
router.get("/:id", optionalAuth, getProduct);
router.post("/", requireAuth, productImageUpload, postProduct);
router.put("/:id", requireAuth, productImageUpload, putProduct);
router.delete("/:id", requireAuth, removeProduct);

export default router;
