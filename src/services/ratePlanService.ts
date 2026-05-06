import { randomUUID } from "crypto";
import { RatePlan, IRatePlan } from "../models/RatePlan";
import { getCategoriesWithLocalFallback } from "./categoryResilience";

export interface CreateRatePlanPayload {
  propertyId: string;
  categoryId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  pricePerNight: number;
  currency?: string;
  minNights?: number;
}

export interface UpdateRatePlanPayload {
  categoryId?: string;
  name?: string;
  startDate?: Date;
  endDate?: Date;
  pricePerNight?: number;
  currency?: string;
  minNights?: number;
}

/** Cotización base (sin promo) por plan tarifario para un rango de estadía. */
export interface RatePlanQuote {
  ratePlanId: string;
  name: string;
  pricePerNight: number;
  totalAmount: number;
  currency: string;
  minNights?: number;
}

export const RATE_PLAN_BASE_FALLBACK_ID = "__base__";

export const ratePlanService = {
  async create(
    payload: CreateRatePlanPayload,
    userId: string
  ): Promise<IRatePlan> {
    const ratePlan = await RatePlan.create({
      ratePlanId: `rate-${randomUUID()}`,
      ...payload,
      currency: payload.currency?.toUpperCase() ?? "USD",
      isActive: true,
      createdByUserId: userId,
    });
    return ratePlan;
  },

  async listRatePlans(
    propertyId: string,
    categoryId?: string
  ): Promise<IRatePlan[]> {
    const query: Record<string, string | boolean> = {
      propertyId,
      isActive: true,
    };
    if (categoryId) {
      query.categoryId = categoryId;
    }
    return RatePlan.find(query).sort({ startDate: 1 }).lean() as unknown as Promise<
      IRatePlan[]
    >;
  },

  async getRatePlan(ratePlanId: string): Promise<IRatePlan | null> {
    return RatePlan.findOne({ ratePlanId }).lean() as unknown as Promise<IRatePlan | null>;
  },

  async updateRatePlan(
    ratePlanId: string,
    payload: UpdateRatePlanPayload
  ): Promise<IRatePlan | null> {
    const ratePlan = await RatePlan.findOne({ ratePlanId });
    if (!ratePlan) return null;

    if (payload.categoryId !== undefined) ratePlan.categoryId = payload.categoryId;
    if (payload.name !== undefined) ratePlan.name = payload.name;
    if (payload.startDate !== undefined) ratePlan.startDate = payload.startDate;
    if (payload.endDate !== undefined) ratePlan.endDate = payload.endDate;
    if (payload.pricePerNight !== undefined)
      ratePlan.pricePerNight = payload.pricePerNight;
    if (payload.currency !== undefined)
      ratePlan.currency = payload.currency.toUpperCase();
    if (payload.minNights !== undefined) ratePlan.minNights = payload.minNights;

    await ratePlan.save();
    return ratePlan;
  },

  async deleteRatePlan(ratePlanId: string): Promise<void> {
    await RatePlan.updateOne(
      { ratePlanId },
      { $set: { isActive: false } }
    );
  },

  /**
   * Todos los planes activos que cubren el rango [checkIn, checkOut) y cumplen minNights.
   * Ordenados por precio/noche ascendente. Si no hay planes, un ítem sintético con precio de categoría.
   */
  async listPricesForRange(
    propertyId: string,
    categoryId: string,
    checkIn: Date,
    checkOut: Date
  ): Promise<RatePlanQuote[]> {
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const plans = await RatePlan.find({
      propertyId,
      categoryId,
      isActive: true,
      startDate: { $lte: checkInDate },
      endDate: { $gte: checkOutDate },
    })
      .sort({ pricePerNight: 1 })
      .lean();

    const out: RatePlanQuote[] = [];
    for (const p of plans) {
      if (p.minNights != null && p.minNights > nights) continue;
      out.push({
        ratePlanId: p.ratePlanId,
        name: p.name,
        pricePerNight: p.pricePerNight,
        totalAmount: +(p.pricePerNight * nights).toFixed(2),
        currency: p.currency,
        minNights: p.minNights ?? undefined,
      });
    }

    if (out.length === 0) {
      const categories = await getCategoriesWithLocalFallback(propertyId);
      const category = categories.find((c) => c.categoryId === categoryId);
      const baseAmount = category?.basePrice?.amount ?? 0;
      const baseCurrency = category?.basePrice?.currency ?? "USD";
      out.push({
        ratePlanId: RATE_PLAN_BASE_FALLBACK_ID,
        name: "Tarifa estándar",
        pricePerNight: baseAmount,
        totalAmount: +(baseAmount * nights).toFixed(2),
        currency: baseCurrency,
      });
    }

    return out;
  },

  async getPriceForRange(
    propertyId: string,
    categoryId: string,
    checkIn: Date,
    checkOut: Date
  ): Promise<{
    totalAmount: number;
    currency: string;
    pricePerNight: number;
  }> {
    const quotes = await this.listPricesForRange(propertyId, categoryId, checkIn, checkOut);
    const first = quotes[0];
    return {
      totalAmount: first.totalAmount,
      currency: first.currency,
      pricePerNight: first.pricePerNight,
    };
  },

  /**
   * Precio base para una reserva cuando el huésped eligió un plan concreto.
   */
  async getQuoteByRatePlanId(
    ratePlanId: string,
    propertyId: string,
    categoryId: string,
    checkIn: Date,
    checkOut: Date
  ): Promise<RatePlanQuote | null> {
    if (!ratePlanId || ratePlanId === RATE_PLAN_BASE_FALLBACK_ID) {
      const list = await this.listPricesForRange(propertyId, categoryId, checkIn, checkOut);
      return list.find((q) => q.ratePlanId === RATE_PLAN_BASE_FALLBACK_ID) ?? list[0] ?? null;
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const p = await RatePlan.findOne({
      ratePlanId,
      propertyId,
      categoryId,
      isActive: true,
      startDate: { $lte: checkInDate },
      endDate: { $gte: checkOutDate },
    }).lean();

    if (!p) return null;
    if (p.minNights != null && p.minNights > nights) return null;

    return {
      ratePlanId: p.ratePlanId,
      name: p.name,
      pricePerNight: p.pricePerNight,
      totalAmount: +(p.pricePerNight * nights).toFixed(2),
      currency: p.currency,
      minNights: p.minNights ?? undefined,
    };
  },
};
