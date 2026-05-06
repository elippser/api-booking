import { Request, Response } from "express";
import { catchAsync } from "../utils/catch/catchAsync";
import { availabilityService } from "../services/availabilityService";
import {
  availabilityQuerySchema,
  availabilityInitSchema,
} from "../validations/schemas";
import { getCategoriesWithLocalFallback } from "../services/categoryResilience";
import { resolveBookingPropertyId } from "../services/propertyResolveService";

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

    const { checkIn, checkOut, adults, children } = value;
    const propertyId = await resolveBookingPropertyId(value.propertyId);
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;
    const promoCode =
      typeof req.query.promoCode === "string" && req.query.promoCode.trim()
        ? req.query.promoCode.trim()
        : undefined;

    const results = await availabilityService.checkAvailability(
      propertyId,
      new Date(checkIn),
      new Date(checkOut),
      adults,
      children,
      token,
      promoCode
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

export const calendarAvailability = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { propertyId, from, to } = req.query as {
      propertyId?: string;
      from?: string;
      to?: string;
    };

    if (!propertyId || !from || !to) {
      res.status(400).json({
        error: "Faltan parámetros: propertyId, from, to (ISO date)",
      });
      return;
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      res.status(400).json({ error: "Fechas inválidas" });
      return;
    }
    if (fromDate > toDate) {
      res.status(400).json({ error: "from debe ser anterior o igual a to" });
      return;
    }

    // No pasamos token a rooms-app (secrets distintos); usamos endpoint público.
    const rows = await availabilityService.getCalendarAvailability(
      propertyId,
      fromDate,
      toDate
    );

    res.status(200).json(rows);
  }
);

export const syncAvailability = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const propertyId = await resolveBookingPropertyId(req.params.propertyId);
    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined;

    const daysAhead = Number(req.query.days) || 90;
    const fromDate = new Date();
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(fromDate);
    toDate.setDate(toDate.getDate() + daysAhead);

    const categories = await getCategoriesWithLocalFallback(propertyId, token);
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
