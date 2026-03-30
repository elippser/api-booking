import { Router } from "express";
import { authenticateStaff } from "../middleware/authenticateStaff";
import { authenticateGuest } from "../middleware/authenticateGuest";
import {
  createReservation,
  listReservations,
  getReservation,
  updateReservationStatus,
  updateReservationNotes,
  createMotorReservation,
  listMotorReservations,
  getMotorReservation,
  cancelMotorReservation,
} from "../controllers/reservationController";

const router = Router();

// Motor routes (guest) - must be before parameterized routes
router.get("/motor/reservations", authenticateGuest, listMotorReservations);
router.post("/motor/reservations", authenticateGuest, createMotorReservation);
router.get(
  "/motor/reservations/:reservationId",
  authenticateGuest,
  getMotorReservation
);
router.patch(
  "/motor/reservations/:reservationId/cancel",
  authenticateGuest,
  cancelMotorReservation
);

// Staff routes
router.get("/reservations", authenticateStaff, listReservations);
router.post("/reservations", authenticateStaff, createReservation);
router.get("/reservations/:reservationId", authenticateStaff, getReservation);
router.patch(
  "/reservations/:reservationId/status",
  authenticateStaff,
  updateReservationStatus
);
router.patch(
  "/reservations/:reservationId/notes",
  authenticateStaff,
  updateReservationNotes
);

export default router;
