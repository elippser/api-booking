import { getCategories, type CoreCategory } from "./coreClient";
import { RatePlan } from "../models/RatePlan";
import { Availability } from "../models/Availability";

/**
 * 1) Rooms (HTTP). 2) Si viene vacío: categorías que ya existen en rate plans
 * de esta API (mismo `propertyId`). 3) Si sigue vacío: distinct en Availability.
 *
 * Así el motor y las promos no quedan ciegos si Rooms está caído, en otro
 * puerto o el endpoint público no coincide.
 */
export async function getCategoriesWithLocalFallback(
  propertyId: string,
  token?: string
): Promise<CoreCategory[]> {
  const remote = await getCategories(propertyId, token);
  if (remote.length > 0) {
    return remote;
  }

  const fromPlans = await categoriesFromActiveRatePlans(propertyId);
  if (fromPlans.length > 0) {
    return fromPlans;
  }

  return await categoriesFromAvailabilityDocs(propertyId);
}

async function categoriesFromActiveRatePlans(
  propertyId: string
): Promise<CoreCategory[]> {
  const plans = await RatePlan.find({ propertyId, isActive: true })
    .sort({ updatedAt: -1 })
    .lean();
  const map = new Map<string, CoreCategory>();
  for (const p of plans) {
    if (map.has(p.categoryId)) continue;
    map.set(p.categoryId, {
      categoryId: p.categoryId,
      name: p.name,
      basePrice: { amount: p.pricePerNight, currency: p.currency },
      unitCount: 1,
      capacity: { adults: 2, children: 0 },
    });
  }
  return Array.from(map.values());
}

async function categoriesFromAvailabilityDocs(
  propertyId: string
): Promise<CoreCategory[]> {
  const ids = await Availability.distinct("categoryId", { propertyId });
  const list: CoreCategory[] = [];
  for (const categoryId of ids) {
    if (typeof categoryId !== "string" || !categoryId) continue;
    list.push({
      categoryId,
      name: categoryId,
      basePrice: { amount: 0, currency: "USD" },
      unitCount: 1,
      capacity: { adults: 2, children: 0 },
    });
  }
  return list;
}
