import { Request, Response } from "express";
import { catchAsync } from "../utils/catch/catchAsync";
import { availabilityService } from "../services/availabilityService";
import {
  availabilityQuerySchema,
  availabilityInitSchema,
} from "../validations/schemas";
import { getCategories } from "../services/coreClient";

export const checkAvailability = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { error, value } = availabilityQuerySchema.validate(req.query, {
      abortEarly: false,
    });

    if (error) {
      res.status(400).json({
        error: "Validación fallida",
        details: error.details.map((d) => d.message),
      });
      return;
    }

    const { propertyId, checkIn, checkOut, adults, children } = value;
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;

    const results = await availabilityService.checkAvailability(
      propertyId,
      new Date(checkIn),
      new Date(checkOut),
      adults,
      children,
      token
    );

    res.status(200).json(results);
  }
);

export const initializeAvailability = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { error, value } = availabilityInitSchema.validate(req.body, {
      abortEarly: false,
    });

    if (error) {
      res.status(400).json({
        error: "Validación fallida",
        details: error.details.map((d) => d.message),
      });
      return;
    }

    const { propertyId, categoryId, totalUnits, fromDate, toDate } = value;

    await availabilityService.initializeAvailability(
      propertyId,
      categoryId,
      totalUnits,
      new Date(fromDate),
      new Date(toDate)
    );

    res.status(200).json({ message: "Availability initialized" });
  }
);

export const syncAvailability = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { propertyId } = req.params;
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;

    const daysAhead = Number(req.query.days) || 90;
    const fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + daysAhead);

    const categories = await getCategories(propertyId, token);
    if (categories.length === 0) {
      res.status(200).json({ message: "No categories found", synced: 0 });
      return;
    }

    let synced = 0;
    for (const cat of categories) {
      const totalUnits = cat.unitCount ?? 0;
      if (totalUnits > 0) {
        await availabilityService.initializeAvailability(
          propertyId,
          cat.categoryId,
          totalUnits,
          fromDate,
          toDate
        );
        synced++;
      }
    }

    res.status(200).json({
      message: `Availability synced for ${synced} categories`,
      synced,
      daysAhead,
    });
  }
);
