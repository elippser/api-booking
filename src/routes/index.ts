import { Router } from "express";
import availabilityRouter from "./availabilityRouter";
import ratePlanRouter from "./ratePlanRouter";
import reservationRouter from "./reservationRouter";

const router = Router();

router.use("/api/v1/availability", availabilityRouter);
router.use("/api/v1/rate-plans", ratePlanRouter);
router.use("/api/v1", reservationRouter);

export default router;
