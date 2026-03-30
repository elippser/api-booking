import { Request, Response } from "express";
import { catchAsync } from "../utils/catch/catchAsync";
import { reservationService } from "../services/reservationService";
import {
  reservationCreateSchema,
  reservationMotorCreateSchema,
  reservationListQuerySchema,
  updateStatusSchema,
  updateNotesSchema,
} from "../validations/schemas";

function getStaffToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return req.cookies?.app_token;
}

export const createReservation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { error, value } = reservationCreateSchema.validate(req.body, {
      abortEarly: false,
    });

    if (error) {
      res.status(400).json({
        error: "Validación fallida",
        details: error.details.map((d) => d.message),
      });
      return;
    }

    const userId = req.user!.userId;
    const reservation = await reservationService.createReservationFromPMS(
      value,
      userId
    );

    res.status(201).json(reservation);
  }
);

export const listReservations = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { error, value } = reservationListQuerySchema.validate(req.query, {
      abortEarly: false,
    });

    if (error) {
      res.status(400).json({
        error: "Validación fallida",
        details: error.details.map((d) => d.message),
      });
      return;
    }

    const { propertyId, status, checkIn, checkOut, guestId, channel } = value;
    const reservations = await reservationService.listReservations(
      propertyId,
      { status, checkIn, checkOut, guestId, channel }
    );

    res.status(200).json(reservations);
  }
);

export const getReservation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { reservationId } = req.params;

    const reservation = await reservationService.getByReservationId(
      reservationId
    );

    if (!reservation) {
      res.status(404).json({ error: "Reserva no encontrada" });
      return;
    }

    res.status(200).json(reservation);
  }
);

export const updateReservationStatus = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { error, value } = updateStatusSchema.validate(req.body, {
      abortEarly: false,
    });

    if (error) {
      res.status(400).json({
        error: "Validación fallida",
        details: error.details.map((d) => d.message),
      });
      return;
    }

    const { reservationId } = req.params;
    const { status, reason } = value;
    const userId = req.user?.userId;
    const token = getStaffToken(req);

    const reservation = await reservationService.updateReservationStatus(
      reservationId,
      status,
      userId,
      reason,
      token
    );

    res.status(200).json(reservation);
  }
);

export const updateReservationNotes = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { error, value } = updateNotesSchema.validate(req.body, {
      abortEarly: false,
    });

    if (error) {
      res.status(400).json({
        error: "Validación fallida",
        details: error.details.map((d) => d.message),
      });
      return;
    }

    const { reservationId } = req.params;
    const { internalNotes } = value;

    const reservation = await reservationService.updateInternalNotes(
      reservationId,
      internalNotes ?? ""
    );

    if (!reservation) {
      res.status(404).json({ error: "Reserva no encontrada" });
      return;
    }

    res.status(200).json(reservation);
  }
);

// Motor (guest) endpoints
export const createMotorReservation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { error, value } = reservationMotorCreateSchema.validate(req.body, {
      abortEarly: false,
    });

    if (error) {
      res.status(400).json({
        error: "Validación fallida",
        details: error.details.map((d) => d.message),
      });
      return;
    }

    const guestId = req.guest!.guestId;
    const payload = { ...value, guestId };
    const reservation = await reservationService.createReservationFromMotor(
      payload,
      guestId
    );

    res.status(201).json(reservation);
  }
);

export const listMotorReservations = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const guestId = req.guest!.guestId;
    const reservations = await reservationService.listGuestReservations(
      guestId
    );

    res.status(200).json(reservations);
  }
);

export const getMotorReservation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { reservationId } = req.params;
    const guestId = req.guest!.guestId;

    const reservation = await reservationService.getByIdOrCode(reservationId);

    if (!reservation) {
      res.status(404).json({ error: "Reserva no encontrada" });
      return;
    }

    if (reservation.guestId !== guestId) {
      res.status(403).json({ error: "No tiene acceso a esta reserva" });
      return;
    }

    res.status(200).json(reservation);
  }
);

export const cancelMotorReservation = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { reservationId } = req.params;
    const guestId = req.guest!.guestId;

    const existing = await reservationService.getByReservationId(reservationId);

    if (!existing) {
      res.status(404).json({ error: "Reserva no encontrada" });
      return;
    }

    if (existing.guestId !== guestId) {
      res.status(403).json({ error: "No tiene acceso a esta reserva" });
      return;
    }

    const reservation = await reservationService.updateReservationStatus(
      reservationId,
      "cancelled",
      undefined,
      "Cancelada por el huésped"
    );

    res.status(200).json(reservation);
  }
);
