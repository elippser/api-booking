import { randomUUID } from "crypto";
import { Reservation, IReservation } from "../models/Reservation";
import { GuestSummary, getGuestSummariesMap } from "../models/Guest";
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
import { getAvailableUnits, updateUnitStatus } from "./coreClient";
import { getCategoriesWithLocalFallback } from "./categoryResilience";
import { resolveBookingPropertyId } from "./propertyResolveService";
import { promoService } from "./promoService";
import { computePricing } from "./pricingService";

export type ReservationWithGuest = IReservation & { guest?: GuestSummary };

async function attachGuests(
  reservations: IReservation[]
): Promise<ReservationWithGuest[]> {
  if (reservations.length === 0) return [];
  const map = await getGuestSummariesMap(reservations.map((r) => r.guestId));
  return reservations.map((r) => ({
    ...(r as unknown as Record<string, unknown>),
    guest: map.get(r.guestId),
  })) as ReservationWithGuest[];
}

async function attachGuest(
  reservation: IReservation | null
): Promise<ReservationWithGuest | null> {
  if (!reservation) return null;
  const map = await getGuestSummariesMap([reservation.guestId]);
  return {
    ...(reservation as unknown as Record<string, unknown>),
    guest: map.get(reservation.guestId),
  } as ReservationWithGuest;
}

async function getTotalUnitsForCategory(
  propertyId: string,
  categoryId: string
): Promise<number> {
  const existing = await Availability.findOne({
    propertyId,
    categoryId,
  }).sort({ date: -1 });

  if (existing) return existing.totalUnits;

  const categories = await getCategoriesWithLocalFallback(propertyId);
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
  promoCode?: string;
  /** Plan tarifario elegido (motor). */
  ratePlanId?: string;
}

interface PricedReservation {
  pricePerNight: number;
  totalAmount: number;
  currency: string;
  basePerNight: number;
  baseTotal: number;
  appliedPromoId?: string;
  appliedPromoCode?: string;
  appliedPromoName?: string;
  ratePlanId?: string;
}

async function priceReservation(
  payload: CreateReservationPayload,
  checkIn: Date,
  checkOut: Date,
  nights: number
): Promise<PricedReservation> {
  const eligible = await promoService.findEligible(payload.propertyId, payload.promoCode);

  let basePerNight: number;
  let currency: string;
  let chosenRatePlanId: string | undefined;

  if (payload.ratePlanId) {
    const quote = await ratePlanService.getQuoteByRatePlanId(
      payload.ratePlanId,
      payload.propertyId,
      payload.categoryId,
      checkIn,
      checkOut
    );
    if (quote) {
      basePerNight = quote.pricePerNight;
      currency = quote.currency;
      chosenRatePlanId = quote.ratePlanId;
    } else {
      const baseInfo = await ratePlanService.getPriceForRange(
        payload.propertyId,
        payload.categoryId,
        checkIn,
        checkOut
      );
      basePerNight = baseInfo.pricePerNight;
      currency = baseInfo.currency;
    }
  } else {
    const baseInfo = await ratePlanService.getPriceForRange(
      payload.propertyId,
      payload.categoryId,
      checkIn,
      checkOut
    );
    basePerNight = baseInfo.pricePerNight;
    currency = baseInfo.currency;
  }

  const pricing = computePricing({
    propertyId: payload.propertyId,
    categoryId: payload.categoryId,
    basePerNight,
    currency,
    nights,
    checkIn,
    candidates: eligible,
  });

  return {
    pricePerNight: pricing.finalPerNight,
    totalAmount: pricing.finalTotal,
    currency,
    basePerNight,
    baseTotal: +(basePerNight * nights).toFixed(2),
    appliedPromoId: pricing.appliedPromo?.promoId,
    appliedPromoCode: pricing.appliedPromo?.code,
    appliedPromoName: pricing.appliedPromo?.name,
    ratePlanId: chosenRatePlanId,
  };
}

function diffNights(checkIn: Date, checkOut: Date): number {
  return Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) /
      (1000 * 60 * 60 * 24)
  );
}

// Reservas se persisten con la fecha en UTC midnight (`new Date("YYYY-MM-DD")`),
// por eso el rango del día se calcula en UTC.
function dayWindow(value: Date | string): { $gte: Date; $lt: Date } {
  const start = new Date(value);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { $gte: start, $lt: end };
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
    const propertyId = await resolveBookingPropertyId(payload.propertyId);
    const payloadResolved: CreateReservationPayload = { ...payload, propertyId };

    const checkIn = new Date(payloadResolved.checkIn);
    const checkOut = new Date(payloadResolved.checkOut);

    const availability = await availabilityService.checkAvailability(
      propertyId,
      checkIn,
      checkOut,
      payloadResolved.adults,
      payloadResolved.children ?? 0
    );

    const categoryAvailable = availability.find(
      (a) => a.categoryId === payloadResolved.categoryId
    );
    if (!categoryAvailable || categoryAvailable.availableUnits < 1) {
      throw new Error("No hay disponibilidad para la categoría seleccionada");
    }

    const nights = diffNights(checkIn, checkOut);
    const priced = await priceReservation(payloadResolved, checkIn, checkOut, nights);

    const reservationId = `res-${randomUUID()}`;
    const reservationCode = await ensureUniqueReservationCode();

    const totalUnits = await getTotalUnitsForCategory(
      propertyId,
      payloadResolved.categoryId
    );

    let reservation: IReservation | null = null;

    try {
      reservation = await Reservation.create({
        reservationId,
        reservationCode,
        propertyId,
        categoryId: payloadResolved.categoryId,
        guestId,
        checkIn,
        checkOut,
        nights,
        adults: payloadResolved.adults,
        children: payloadResolved.children ?? 0,
        totalAmount: priced.totalAmount,
        currency: priced.currency,
        status: "pending",
        channel: "direct",
        specialRequests: payloadResolved.specialRequests,
        appliedPromoId: priced.appliedPromoId,
        appliedPromoCode: priced.appliedPromoCode,
        appliedPromoName: priced.appliedPromoName,
        priceBeforePromo: priced.basePerNight,
        totalBeforePromo: priced.baseTotal,
        ratePlanId: priced.ratePlanId,
      });

      await availabilityService.decrementAvailability(
        propertyId,
        payloadResolved.categoryId,
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

    const nights = diffNights(checkIn, checkOut);
    const priced = await priceReservation(payload, checkIn, checkOut, nights);

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
        totalAmount: priced.totalAmount,
        currency: priced.currency,
        status: "confirmed",
        channel: payload.channel ?? "direct",
        specialRequests: payload.specialRequests,
        createdByUserId: userId,
        appliedPromoId: priced.appliedPromoId,
        appliedPromoCode: priced.appliedPromoCode,
        appliedPromoName: priced.appliedPromoName,
        priceBeforePromo: priced.basePerNight,
        totalBeforePromo: priced.baseTotal,
        ratePlanId: priced.ratePlanId,
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
  ): Promise<ReservationWithGuest[]> {
    const query: Record<string, unknown> = { propertyId };

    if (filters?.status) query.status = filters.status;
    if (filters?.guestId) query.guestId = filters.guestId;
    if (filters?.channel) query.channel = filters.channel;
    if (filters?.checkIn) query.checkIn = dayWindow(filters.checkIn);
    if (filters?.checkOut) query.checkOut = dayWindow(filters.checkOut);

    const docs = (await Reservation.find(query).sort({ checkIn: 1 }).lean()) as unknown as IReservation[];
    return attachGuests(docs);
  },

  async listGuestReservations(
    guestId: string,
    filters?: { propertyId?: string }
  ): Promise<ReservationWithGuest[]> {
    const query: Record<string, unknown> = { guestId };
    if (filters?.propertyId) query.propertyId = filters.propertyId;

    const docs = (await Reservation.find(query)
      .sort({ checkIn: -1 })
      .lean()) as unknown as IReservation[];
    return attachGuests(docs);
  },

  async getByReservationId(reservationId: string): Promise<ReservationWithGuest | null> {
    const doc = (await Reservation.findOne({ reservationId }).lean()) as unknown as IReservation | null;
    return attachGuest(doc);
  },

  async getByReservationCode(reservationCode: string): Promise<ReservationWithGuest | null> {
    const doc = (await Reservation.findOne({ reservationCode }).lean()) as unknown as IReservation | null;
    return attachGuest(doc);
  },

  async getByIdOrCode(idOrCode: string): Promise<ReservationWithGuest | null> {
    const byId = (await Reservation.findOne({ reservationId: idOrCode }).lean()) as unknown as IReservation | null;
    if (byId) return attachGuest(byId);
    const byCode = (await Reservation.findOne({ reservationCode: idOrCode }).lean()) as unknown as IReservation | null;
    return attachGuest(byCode);
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
