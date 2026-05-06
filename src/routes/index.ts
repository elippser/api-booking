import { Router } from "express";
import availabilityRouter from "./availabilityRouter";
import categoryRouter from "./categoryRouter";
import promoRouter from "./promoRouter";
import ratePlanRouter from "./ratePlanRouter";
import reservationRouter from "./reservationRouter";

const router = Router();

router.use("/api/v1/availability", availabilityRouter);
router.use("/api/v1/categories", categoryRouter);
router.use("/api/v1/promos", promoRouter);
router.use("/api/v1/rate-plans", ratePlanRouter);
router.use("/api/v1", reservationRouter);

export default router;
