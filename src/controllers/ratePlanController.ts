import { Request, Response } from "express";
import { catchAsync } from "../utils/catch/catchAsync";
import { ratePlanService } from "../services/ratePlanService";
import {
  ratePlanCreateSchema,
  ratePlanUpdateSchema,
} from "../validations/schemas";

export const createRatePlan = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { error, value } = ratePlanCreateSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      res.status(400).json({
        error: "Validación fallida",
        details: error.details.map((d) => d.message),
      });
      return;
    }

    const userId = req.user!.userId;
    const ratePlan = await ratePlanService.create(value, userId);

    res.status(201).json(ratePlan);
  }
);

export const listRatePlans = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { propertyId, categoryId } = req.query;

    if (!propertyId || typeof propertyId !== "string") {
      res.status(400).json({ error: "propertyId es requerido" });
      return;
    }

    const plans = await ratePlanService.listRatePlans(
      propertyId,
      typeof categoryId === "string" ? categoryId : undefined
    );

    res.status(200).json(plans);
  }
);

export const getRatePlan = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { ratePlanId } = req.params;

    const ratePlan = await ratePlanService.getRatePlan(ratePlanId);

    if (!ratePlan) {
      res.status(404).json({ error: "Plan tarifario no encontrado" });
      return;
    }

    res.status(200).json(ratePlan);
  }
);

export const updateRatePlan = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { error, value } = ratePlanUpdateSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      res.status(400).json({
        error: "Validación fallida",
        details: error.details.map((d) => d.message),
      });
      return;
    }

    const { ratePlanId } = req.params;
    const ratePlan = await ratePlanService.updateRatePlan(ratePlanId, value);

    if (!ratePlan) {
      res.status(404).json({ error: "Plan tarifario no encontrado" });
      return;
    }

    res.status(200).json(ratePlan);
  }
);

export const deleteRatePlan = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { ratePlanId } = req.params;

    const existing = await ratePlanService.getRatePlan(ratePlanId);
    if (!existing) {
      res.status(404).json({ error: "Plan tarifario no encontrado" });
      return;
    }

    await ratePlanService.deleteRatePlan(ratePlanId);
    res.status(204).send();
  }
);
