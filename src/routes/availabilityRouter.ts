import { Router } from "express";
import {
  calendarAvailability,
  checkAvailability,
  initializeAvailability,
  syncAvailability,
} from "../controllers/availabilityController";
import { authenticateStaff } from "../middleware/authenticateStaff";

const router = Router();

router.get("/", checkAvailability);
router.get("/calendar", authenticateStaff, calendarAvailability);
router.post("/initialize", authenticateStaff, initializeAvailability);
router.post("/sync/:propertyId", authenticateStaff, syncAvailability);

export default router;
