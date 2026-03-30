import { Router } from "express";
import { authenticateStaff } from "../middleware/authenticateStaff";
import { requireRole } from "../middleware/requireRole";
import {
  createRatePlan,
  listRatePlans,
  getRatePlan,
  updateRatePlan,
  deleteRatePlan,
} from "../controllers/ratePlanController";

const router = Router();

router.use(authenticateStaff);

router.post("/", requireRole("owner", "admin"), createRatePlan);
router.get("/", listRatePlans);
router.get("/:ratePlanId", getRatePlan);
router.patch("/:ratePlanId", requireRole("owner", "admin"), updateRatePlan);
router.delete("/:ratePlanId", requireRole("owner", "admin"), deleteRatePlan);

export default router;
