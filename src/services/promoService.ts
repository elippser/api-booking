import { randomUUID } from "crypto";
import { Promo, IPromo, derivePromoStatus, PromoStatus } from "../models/Promo";

export interface PromoSummary extends Omit<IPromo, "$assertPopulated" | "save" | "remove" | "validate" | "$where" | keyof Document> {
  status: PromoStatus;
}

function attachStatus<T extends { isEnabled: boolean; startDate?: Date; endDate?: Date }>(p: T): T & { status: PromoStatus } {
  return { ...p, status: derivePromoStatus(p) };
}

export const promoService = {
  async list(propertyId: string): Promise<(IPromo & { status: PromoStatus })[]> {
    const docs = (await Promo.find({ propertyId }).sort({ createdAt: -1 }).lean()) as unknown as IPromo[];
    return docs.map((d) => attachStatus(d));
  },

  async get(promoId: string): Promise<(IPromo & { status: PromoStatus }) | null> {
    const doc = (await Promo.findOne({ promoId }).lean()) as unknown as IPromo | null;
    return doc ? attachStatus(doc) : null;
  },

  async create(payload: Partial<IPromo>): Promise<IPromo> {
    const promoId = `promo-${randomUUID()}`;

    if (payload.type === "code" && payload.code) {
      const dup = await Promo.findOne({
        propertyId: payload.propertyId,
        code: payload.code.toUpperCase(),
      }).lean();
      if (dup) {
        throw new Error("Ya existe una promo con ese código en esta propiedad");
      }
    }

    const created = await Promo.create({
      ...payload,
      promoId,
    });
    return created.toObject() as unknown as IPromo;
  },

  async update(promoId: string, patch: Partial<IPromo>): Promise<IPromo | null> {
    const existing = await Promo.findOne({ promoId });
    if (!existing) return null;

    if (patch.type === "code" && patch.code && patch.code.toUpperCase() !== existing.code) {
      const dup = await Promo.findOne({
        propertyId: existing.propertyId,
        code: patch.code.toUpperCase(),
        promoId: { $ne: promoId },
      }).lean();
      if (dup) {
        throw new Error("Ya existe una promo con ese código en esta propiedad");
      }
    }

    const updated = await Promo.findOneAndUpdate(
      { promoId },
      { $set: patch },
      { new: true }
    ).lean();
    return updated as unknown as IPromo | null;
  },

  async toggle(promoId: string, isEnabled: boolean): Promise<IPromo | null> {
    const updated = await Promo.findOneAndUpdate(
      { promoId },
      { $set: { isEnabled } },
      { new: true }
    ).lean();
    return updated as unknown as IPromo | null;
  },

  async remove(promoId: string): Promise<boolean> {
    const r = await Promo.deleteOne({ promoId });
    return r.deletedCount > 0;
  },

  /**
   * Promos elegibles para una consulta (auto + opcional code).
   * Filtra por propiedad, isEnabled, ventana de validez y código (si se pasa).
   * No filtra por categoría/min nights/min advance — eso lo hace el pricing engine.
   */
  async findEligible(
    propertyId: string,
    code?: string
  ): Promise<IPromo[]> {
    const now = new Date();
    const startOfTodayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );
    // Sólo `auto` sin código. Las de tipo `code` se incluyen si el query trae el mismo
    // `promoCode` (código = descuento); si el huésped no lo ingresa en el motor, no
    // entran al pricing (no aplica poner 10% en /promos y verlo sin tipear el código).
    const orFilters: Record<string, unknown>[] = [{ type: "auto" }];
    const normalizedCode = code?.trim().toUpperCase();
    if (normalizedCode) {
      orFilters.push({ type: "code", code: normalizedCode });
    }

    // endDate suele guardarse como medianoche UTC del último día; `endDate >= now`
    // descartaba la promo ese mismo día por la tarde. Usamos inicio del día UTC.
    const docs = await Promo.find({
      propertyId,
      isEnabled: true,
      $or: orFilters,
      $and: [
        {
          $or: [
            { endDate: { $exists: false } },
            { endDate: null },
            { endDate: { $gte: startOfTodayUtc } },
          ],
        },
      ],
    }).lean();

    return docs as unknown as IPromo[];
  },
};
