import { Router } from "express";
import { authenticateStaff } from "../middleware/authenticateStaff";
import {
  listPromos,
  getPromo,
  createPromo,
  updatePromo,
  togglePromo,
  deletePromo,
} from "../controllers/promoController";

const router = Router();

router.get("/", authenticateStaff, listPromos);
router.post("/", authenticateStaff, createPromo);
router.get("/:promoId", authenticateStaff, getPromo);
router.patch("/:promoId", authenticateStaff, updatePromo);
router.patch("/:promoId/toggle", authenticateStaff, togglePromo);
router.delete("/:promoId", authenticateStaff, deletePromo);

export default router;
