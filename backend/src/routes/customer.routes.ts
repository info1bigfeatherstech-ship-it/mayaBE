import { Router } from "express";
import { getCustomers, postCustomer, putCustomer, removeCustomer } from "../controllers/customer.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { validateBody } from "../middlewares/validate.middleware";
import { customerSchema } from "../validators/customer.validator";

const router = Router();

router.get("/", requireAuth, getCustomers);
router.post("/", requireAuth, validateBody(customerSchema), postCustomer);
router.put("/:id", requireAuth, validateBody(customerSchema), putCustomer);
router.delete("/:id", requireAuth, removeCustomer);

export default router;
