import { randomUUID } from "crypto";
import { Reservation, IReservation } from "../models/Reservation";
import {
  VALID_RESERVATION_TRANSITIONS,
  ReservationStatus,
  ReservationChannel,
} from "../constants/reservationConstants";
import { generateReservationCode } from "../utils/generateReservationCode";
import {
  availabilityService,
  AvailabilityResult,
} from "./availabilityService";
import { ratePlanService } from "./ratePlanService";
import { Availability } from "../models/Availability";
import { getCategories, getAvailableUnits, updateUnitStatus } from "./coreClient";

async function getTotalUnitsForCategory(
  propertyId: string,
  categoryId: string
): Promise<number> {
  const existing = await Availability.findOne({
    propertyId,
    categoryId,
  }).sort({ date: -1 });

  if (existing) return existing.totalUnits;

  const categories = await getCategories(propertyId);
  const cat = categories.find((c) => c.categoryId === categoryId);
  return cat?.unitCount ?? 1;
}

export interface CreateReservationPayload {
  propertyId: string;
  categoryId: string;
  guestId: string;
  checkIn: Date;
  checkOut: Date;
  adults: number;
  children?: number;
  specialRequests?: string;
  channel?: ReservationChannel;
}

function diffNights(checkIn: Date, checkOut: Date): number {
  return Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

async function ensureUniqueReservationCode(): Promise<string> {
  let code = generateReservationCode();
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const existing = await Reservation.findOne({ reservationCode: code });
    if (!existing) return code;
    code = generateReservationCode();
    attempts++;
  }

  throw new Error("No se pudo generar un código de reserva único");
}

export const reservationService = {
  async createReservationFromMotor(
    payload: CreateReservationPayload,
    guestId: string
  ): Promise<IReservation> {
    const checkIn = new Date(payload.checkIn);
    const checkOut = new Date(payload.checkOut);

    const availability = await availabilityService.checkAvailability(
      payload.propertyId,
      checkIn,
      checkOut,
      payload.adults,
      payload.children ?? 0
    );

    const categoryAvailable = availability.find(
      (a) => a.categoryId === payload.categoryId
    );
    if (!categoryAvailable || categoryAvailable.availableUnits < 1) {
      throw new Error("No hay disponibilidad para la categoría seleccionada");
    }

    const priceInfo = await ratePlanService.getPriceForRange(
      payload.propertyId,
      payload.categoryId,
      checkIn,
      checkOut
    );

    const nights = diffNights(checkIn, checkOut);
    const reservationId = `res-${randomUUID()}`;
    const reservationCode = await ensureUniqueReservationCode();

    const totalUnits = await getTotalUnitsForCategory(
      payload.propertyId,
      payload.categoryId
    );

    let reservation: IReservation | null = null;

    try {
      reservation = await Reservation.create({
        reservationId,
        reservationCode,
        propertyId: payload.propertyId,
        categoryId: payload.categoryId,
        guestId,
        checkIn,
        checkOut,
        nights,
        adults: payload.adults,
        children: payload.children ?? 0,
        totalAmount: priceInfo.totalAmount,
        currency: priceInfo.currency,
        status: "pending",
        channel: "direct",
        specialRequests: payload.specialRequests,
      });

      await availabilityService.decrementAvailability(
        payload.propertyId,
        payload.categoryId,
        checkIn,
        checkOut,
        totalUnits
      );

      return reservation;
    } catch (err) {
      if (reservation) {
        await Reservation.deleteOne({ reservationId });
      }
      throw err;
    }
  },

  async createReservationFromPMS(
    payload: CreateReservationPayload,
    userId: string
  ): Promise<IReservation> {
    const checkIn = new Date(payload.checkIn);
    const checkOut = new Date(payload.checkOut);

    const availability = await availabilityService.checkAvailability(
      payload.propertyId,
      checkIn,
      checkOut,
      payload.adults,
      payload.children ?? 0
    );

    const categoryAvailable = availability.find(
      (a: AvailabilityResult) => a.categoryId === payload.categoryId
    );
    if (!categoryAvailable || categoryAvailable.availableUnits < 1) {
      throw new Error("No hay disponibilidad para la categoría seleccionada");
    }

    const priceInfo = await ratePlanService.getPriceForRange(
      payload.propertyId,
      payload.categoryId,
      checkIn,
      checkOut
    );

    const nights = diffNights(checkIn, checkOut);
    const reservationId = `res-${randomUUID()}`;
    const reservationCode = await ensureUniqueReservationCode();

    const totalUnits = await getTotalUnitsForCategory(
      payload.propertyId,
      payload.categoryId
    );

    let reservation: IReservation | null = null;

    try {
      reservation = await Reservation.create({
        reservationId,
        reservationCode,
        propertyId: payload.propertyId,
        categoryId: payload.categoryId,
        guestId: payload.guestId,
        checkIn,
        checkOut,
        nights,
        adults: payload.adults,
        children: payload.children ?? 0,
        totalAmount: priceInfo.totalAmount,
        currency: priceInfo.currency,
        status: "confirmed",
        channel: payload.channel ?? "direct",
        specialRequests: payload.specialRequests,
        createdByUserId: userId,
      });

      await availabilityService.decrementAvailability(
        payload.propertyId,
        payload.categoryId,
        checkIn,
        checkOut,
        totalUnits
      );

      return reservation;
    } catch (err) {
      if (reservation) {
        await Reservation.deleteOne({ reservationId });
      }
      throw err;
    }
  },

  async listReservations(
    propertyId: string,
    filters?: {
      status?: ReservationStatus;
      checkIn?: Date;
      checkOut?: Date;
      guestId?: string;
      channel?: ReservationChannel;
    }
  ): Promise<IReservation[]> {
    const query: Record<string, unknown> = { propertyId };

    if (filters?.status) query.status = filters.status;
    if (filters?.guestId) query.guestId = filters.guestId;
    if (filters?.channel) query.channel = filters.channel;
    if (filters?.checkIn)
      query.checkIn = { $gte: new Date(filters.checkIn) };
    if (filters?.checkOut)
      query.checkOut = { $lte: new Date(filters.checkOut) };

    return Reservation.find(query).sort({ checkIn: 1 }).lean() as unknown as Promise<
      IReservation[]
    >;
  },

  async listGuestReservations(guestId: string): Promise<IReservation[]> {
    return Reservation.find({ guestId })
      .sort({ checkIn: -1 })
      .lean() as unknown as Promise<IReservation[]>;
  },

  async getByReservationId(reservationId: string): Promise<IReservation | null> {
    return Reservation.findOne({ reservationId }).lean() as unknown as Promise<IReservation | null>;
  },

  async getByReservationCode(reservationCode: string): Promise<IReservation | null> {
    return Reservation.findOne({ reservationCode }).lean() as unknown as Promise<IReservation | null>;
  },

  async getByIdOrCode(idOrCode: string): Promise<IReservation | null> {
    const byId = await Reservation.findOne({ reservationId: idOrCode }).lean();
    if (byId) return byId as unknown as IReservation;
    return Reservation.findOne({ reservationCode: idOrCode }).lean() as unknown as Promise<IReservation | null>;
  },

  async updateReservationStatus(
    reservationId: string,
    newStatus: ReservationStatus,
    userId?: string,
    reason?: string,
    staffToken?: string
  ): Promise<IReservation> {
    const reservation = await Reservation.findOne({ reservationId });
    if (!reservation) {
      throw new Error("Reserva no encontrada");
    }

    const currentStatus = reservation.status as ReservationStatus;
    const allowed = VALID_RESERVATION_TRANSITIONS[currentStatus];
    if (!allowed?.includes(newStatus)) {
      throw new Error(
        `Transición de estado inválida: ${currentStatus} -> ${newStatus}`
      );
    }

    if (newStatus === "checked-in") {
      const unitId = await this.assignUnit(
        reservationId,
        reservation.propertyId,
        reservation.categoryId,
        staffToken || ""
      );
      reservation.assignedUnitId = unitId;
    }

    if (newStatus === "cancelled") {
      await availabilityService.incrementAvailability(
        reservation.propertyId,
        reservation.categoryId,
        reservation.checkIn,
        reservation.checkOut
      );
      reservation.cancelledAt = new Date();
      reservation.cancelledReason = reason;
    }

    reservation.status = newStatus;
    await reservation.save();

    return reservation;
  },

  async assignUnit(
    reservationId: string,
    propertyId: string,
    categoryId: string,
    token: string
  ): Promise<string> {
    const units = await getAvailableUnits(propertyId, categoryId, token);
    if (!units || units.length === 0) {
      throw new Error("No hay unidades disponibles para esta categoría");
    }

    const unit = units[0];
    await updateUnitStatus(
      propertyId,
      categoryId,
      unit.unitId,
      "occupied",
      token
    );

    await Reservation.updateOne(
      { reservationId },
      { $set: { assignedUnitId: unit.unitId } }
    );

    return unit.unitId;
  },

  async updateInternalNotes(
    reservationId: string,
    internalNotes: string
  ): Promise<IReservation | null> {
    const reservation = await Reservation.findOne({ reservationId });
    if (!reservation) return null;

    reservation.internalNotes = internalNotes;
    await reservation.save();
    return reservation;
  },
};
