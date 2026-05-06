import { Availability } from "../models/Availability";
import type { IPromo } from "../models/Promo";
import { getCategoriesWithLocalFallback } from "./categoryResilience";
import {
  ratePlanService,
  RATE_PLAN_BASE_FALLBACK_ID,
  type RatePlanQuote,
} from "./ratePlanService";
import { promoService } from "./promoService";
import { computePricing, AppliedPromo } from "./pricingService";

/** Una fila por plan tarifario activo, ya con promo aplicada (si corresponde). */
export interface AvailabilityRatePlanOption {
  ratePlanId: string;
  name: string;
  pricePerNight: number;
  totalAmount: number;
  currency: string;
  basePricePerNight: number;
  appliedPromo?: AppliedPromo;
  minNights?: number;
}

export interface AvailabilityResult {
  categoryId: string;
  name: string;
  description?: string;
  photos?: string[];
  capacity?: { adults: number; children: number };
  amenities?: string[];
  availableUnits: number;
  pricePerNight: number;
  totalAmount: number;
  currency: string;
  nights: number;
  /** Precio sin promo (igual a pricePerNight si no hay promo aplicada). */
  basePricePerNight?: number;
  appliedPromo?: AppliedPromo;
  /** Planes tarifarios elegibles para la estadía, ordenados del más barato al más caro (total). */
  ratePlanOptions?: AvailabilityRatePlanOption[];
}

function buildRatePlanOptions(
  quotes: RatePlanQuote[],
  ctx: {
    propertyId: string;
    categoryId: string;
    nights: number;
    checkIn: Date;
    candidates: IPromo[];
  }
): AvailabilityRatePlanOption[] {
  const opts: AvailabilityRatePlanOption[] = quotes.map((q) => {
    const pricing = computePricing({
      propertyId: ctx.propertyId,
      categoryId: ctx.categoryId,
      basePerNight: q.pricePerNight,
      currency: q.currency,
      nights: ctx.nights,
      checkIn: ctx.checkIn,
      candidates: ctx.candidates,
    });
    return {
      ratePlanId: q.ratePlanId,
      name: q.name,
      pricePerNight: pricing.finalPerNight,
      totalAmount: pricing.finalTotal,
      currency: q.currency,
      basePricePerNight: pricing.basePerNight,
      appliedPromo: pricing.appliedPromo,
      minNights: q.minNights,
    };
  });
  opts.sort((a, b) => a.totalAmount - b.totalAmount || a.pricePerNight - b.pricePerNight);
  return opts;
}

/**
 * Consultar disponibilidad por rango de fechas.
 */
export async function checkAvailability(
  propertyId: string,
  checkIn: Date,
  checkOut: Date,
  adults?: number,
  children?: number,
  token?: string,
  promoCode?: string
): Promise<AvailabilityResult[]> {
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  if (checkInDate >= checkOutDate) {
    throw new Error("checkOut debe ser posterior a checkIn");
  }

  const categories = await getCategoriesWithLocalFallback(propertyId, token);
  if (categories.length === 0) {
    return [];
  }

  const eligiblePromos = await promoService.findEligible(propertyId, promoCode);

  const results: AvailabilityResult[] = [];

  const filtered = categories.filter((cat) => {
    if (!cat.capacity) return true;
    const meetsAdults = !adults || cat.capacity.adults >= adults;
    const meetsChildren = !children || cat.capacity.children >= (children ?? 0);
    return meetsAdults && meetsChildren;
  });

  for (const category of filtered) {
    const totalUnits = category.unitCount ?? 0;
    if (totalUnits <= 0) continue;

    const availabilityDocs = await Availability.find({
      propertyId,
      categoryId: category.categoryId,
      date: {
        $gte: checkInDate,
        $lt: checkOutDate,
      },
    }).lean();

    let minAvailable: number;

    if (availabilityDocs.length === 0) {
      // No availability docs yet = no reservations exist, all units free
      minAvailable = totalUnits;
    } else {
      minAvailable = Math.min(
        ...availabilityDocs.map((d) => d.availableUnits)
      );
    }

    if (minAvailable <= 0) {
      continue;
    }

    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    let quotes: RatePlanQuote[];
    try {
      quotes = await ratePlanService.listPricesForRange(
        propertyId,
        category.categoryId,
        checkInDate,
        checkOutDate
      );
    } catch {
      const baseAmount = category.basePrice?.amount ?? 0;
      const baseCurrency = category.basePrice?.currency ?? "USD";
      quotes = [
        {
          ratePlanId: RATE_PLAN_BASE_FALLBACK_ID,
          name: "Tarifa estándar",
          pricePerNight: baseAmount,
          totalAmount: +(baseAmount * nights).toFixed(2),
          currency: baseCurrency,
        },
      ];
    }

    const ratePlanOptions = buildRatePlanOptions(quotes, {
      propertyId,
      categoryId: category.categoryId,
      nights,
      checkIn: checkInDate,
      candidates: eligiblePromos,
    });

    const best = ratePlanOptions[0];
    if (!best) continue;

    results.push({
      categoryId: category.categoryId,
      name: category.name,
      description: category.description,
      photos: category.photos,
      capacity: category.capacity,
      amenities: category.amenities,
      availableUnits: minAvailable,
      pricePerNight: best.pricePerNight,
      totalAmount: best.totalAmount,
      currency: best.currency,
      nights,
      basePricePerNight: best.basePricePerNight,
      appliedPromo: best.appliedPromo,
      ratePlanOptions,
    });
  }

  return results;
}

/**
 * Actualizar disponibilidad al crear reserva.
 */
export async function decrementAvailability(
  propertyId: string,
  categoryId: string,
  checkIn: Date,
  checkOut: Date,
  totalUnitsFromRooms: number
): Promise<void> {
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  const currentDate = new Date(checkInDate);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate < checkOutDate) {
    let doc = await Availability.findOne({
      propertyId,
      categoryId,
      date: currentDate,
    });

    if (!doc) {
      doc = await Availability.create({
        propertyId,
        categoryId,
        date: new Date(currentDate),
        totalUnits: totalUnitsFromRooms,
        reservedUnits: 1,
        blockedUnits: 0,
        availableUnits: Math.max(0, totalUnitsFromRooms - 1),
      });
    } else {
      doc.reservedUnits += 1;
      doc.availableUnits = Math.max(
        0,
        doc.totalUnits - doc.reservedUnits - doc.blockedUnits
      );
      await doc.save();
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }
}

/**
 * Actualizar disponibilidad al cancelar reserva.
 */
export async function incrementAvailability(
  propertyId: string,
  categoryId: string,
  checkIn: Date,
  checkOut: Date
): Promise<void> {
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  const currentDate = new Date(checkInDate);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate < checkOutDate) {
    const doc = await Availability.findOne({
      propertyId,
      categoryId,
      date: currentDate,
    });

    if (doc) {
      doc.reservedUnits = Math.max(0, doc.reservedUnits - 1);
      doc.availableUnits = doc.totalUnits - doc.reservedUnits - doc.blockedUnits;
      await doc.save();
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }
}

/**
 * Inicializar disponibilidad para una propiedad/categoría en un rango de fechas.
 */
export async function initializeAvailability(
  propertyId: string,
  categoryId: string,
  totalUnits: number,
  fromDate: Date,
  toDate: Date
): Promise<void> {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  from.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);

  const currentDate = new Date(from);

  while (currentDate <= to) {
    const existing = await Availability.findOne({
      propertyId,
      categoryId,
      date: currentDate,
    });

    if (!existing) {
      await Availability.create({
        propertyId,
        categoryId,
        date: new Date(currentDate),
        totalUnits,
        reservedUnits: 0,
        blockedUnits: 0,
        availableUnits: totalUnits,
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }
}

export interface CalendarDay {
  date: string;
  availableUnits: number;
}

export interface CalendarRow {
  categoryId: string;
  name: string;
  totalUnits: number;
  days: CalendarDay[];
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Devuelve disponibilidad por categoría para cada día en el rango [from, to].
 * Si una fecha no tiene Availability doc, asume `totalUnits` libres (sin reservas).
 */
export async function getCalendarAvailability(
  propertyId: string,
  from: Date,
  to: Date,
  token?: string
): Promise<CalendarRow[]> {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  if (start > end) return [];

  const categories = await getCategoriesWithLocalFallback(propertyId, token);
  if (categories.length === 0) return [];

  const docs = await Availability.find({
    propertyId,
    categoryId: { $in: categories.map((c) => c.categoryId) },
    date: { $gte: start, $lte: end },
  }).lean();

  const docByKey = new Map<string, number>();
  for (const d of docs) {
    docByKey.set(`${d.categoryId}|${isoDay(d.date)}`, d.availableUnits);
  }

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    dates.push(isoDay(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return categories
    .map((cat) => {
      const totalUnits = cat.unitCount ?? 0;
      const days: CalendarDay[] = dates.map((date) => {
        const stored = docByKey.get(`${cat.categoryId}|${date}`);
        return {
          date,
          availableUnits: stored ?? totalUnits,
        };
      });
      return {
        categoryId: cat.categoryId,
        name: cat.name,
        totalUnits,
        days,
      };
    })
    .filter((row) => row.totalUnits > 0);
}

export const availabilityService = {
  checkAvailability,
  decrementAvailability,
  incrementAvailability,
  initializeAvailability,
  getCalendarAvailability,
};
