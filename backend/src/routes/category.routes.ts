import { Router } from "express";
import {
  getCategories,
  getCategorySlug,
  postCategory,
  putCategory,
  removeCategory,
} from "../controllers/category.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validateBody } from "../middlewares/validate.middleware";
import { categorySchema } from "../validators/category.validator";

const router = Router();

router.get("/", getCategories);
router.get("/by-slug/:slug", getCategorySlug);
router.post("/", requireAuth, validateBody(categorySchema), postCategory);
router.put("/:id", requireAuth, validateBody(categorySchema), putCategory);
router.delete("/:id", requireAuth, removeCategory);

export default router;
