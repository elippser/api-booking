import { Router } from "express";
import {
  checkAvailability,
  initializeAvailability,
  syncAvailability,
} from "../controllers/availabilityController";
import { authenticateStaff } from "../middleware/authenticateStaff";

const router = Router();

router.get("/", checkAvailability);
router.post("/initialize", authenticateStaff, initializeAvailability);
router.post("/sync/:propertyId", authenticateStaff, syncAvailability);

export default router;
