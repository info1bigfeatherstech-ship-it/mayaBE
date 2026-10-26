import { Router } from "express";
import { getFactories, postFactory, putFactory, removeFactory } from "../controllers/factory.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validateBody } from "../middlewares/validate.middleware";
import { factorySchema } from "../validators/factory.validator";

const router = Router();

router.get("/", requireAuth, getFactories);
router.post("/", requireAuth, validateBody(factorySchema), postFactory);
router.put("/:id", requireAuth, validateBody(factorySchema), putFactory);
router.delete("/:id", requireAuth, removeFactory);

export default router;
