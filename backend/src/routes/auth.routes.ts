import { Router } from "express";
import { login, logout, me } from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { requireTrustedOrigin } from "../middlewares/origin.middleware";
import { loginRateLimit } from "../middlewares/rateLimit.middleware";
import { validateBody } from "../middlewares/validate.middleware";
import { loginSchema } from "../validators/auth.validator";

const router = Router();

router.post("/login", loginRateLimit, requireTrustedOrigin, validateBody(loginSchema), login);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

export default router;
