import { Router } from "express";
import { authenticateStaff } from "../middleware/authenticateStaff";
import { listCategories } from "../controllers/categoryController";

const router = Router();

router.get("/", authenticateStaff, listCategories);

export default router;
