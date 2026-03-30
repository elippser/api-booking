import { randomUUID } from "crypto";
import { RatePlan, IRatePlan } from "../models/RatePlan";
import { getCategories } from "./coreClient";

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
  name?: string;
  startDate?: Date;
  endDate?: Date;
  pricePerNight?: number;
  currency?: string;
  minNights?: number;
}

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
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const ratePlan = await RatePlan.findOne({
      propertyId,
      categoryId,
      isActive: true,
      startDate: { $lte: checkInDate },
      endDate: { $gte: checkOutDate },
    }).sort({ pricePerNight: 1 });

    if (ratePlan && (!ratePlan.minNights || ratePlan.minNights <= nights)) {
      return {
        totalAmount: ratePlan.pricePerNight * nights,
        currency: ratePlan.currency,
        pricePerNight: ratePlan.pricePerNight,
      };
    }

    const categories = await getCategories(propertyId);
    const category = categories.find((c) => c.categoryId === categoryId);
    const baseAmount = category?.basePrice?.amount ?? 0;
    const baseCurrency = category?.basePrice?.currency ?? "USD";

    return {
      totalAmount: baseAmount * nights,
      currency: baseCurrency,
      pricePerNight: baseAmount,
    };
  },
};
