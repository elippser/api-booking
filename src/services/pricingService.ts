import { IPromo } from "../models/Promo";

export interface AppliedPromo {
  promoId: string;
  name: string;
  discountType: IPromo["discountType"];
  discountValue: number;
  deltaPerNight: number;     // signed: negative = cheaper, positive = surcharge
  deltaTotal: number;
  deltaPercent?: number;     // vs basePerNight
  code?: string;
}

export interface PricingResult {
  basePerNight: number;
  finalPerNight: number;
  finalTotal: number;
  appliedPromo?: AppliedPromo;
  /**
   * Las promos descartadas por restricciones (min noches/anticipación) no
   * llegan acá, pero las que perdieron la comparación aparecen como
   * candidatos para audit. Útil sólo si querés debug; el front no las consume.
   */
  candidates?: AppliedPromo[];
}

export interface PricingInput {
  propertyId: string;
  categoryId: string;
  basePerNight: number;
  currency: string;
  nights: number;
  checkIn: Date;
  /** Promos elegibles ya filtradas por isEnabled + ventana de validez + (opcional) code. */
  candidates: IPromo[];
}

function applyPromo(
  promo: IPromo,
  basePerNight: number,
  currency: string,
  nights: number
): { finalPerNight: number; appliedPromo: AppliedPromo } {
  let finalPerNight = basePerNight;

  if (promo.discountType === "percentage") {
    // discountValue signed: -30 = -30%, +30 = +30%
    finalPerNight = basePerNight * (1 + promo.discountValue / 100);
  } else if (promo.discountType === "fixed_amount") {
    // signed in same currency; we don't convert currencies here
    if (!promo.currency || promo.currency.toUpperCase() === currency.toUpperCase()) {
      finalPerNight = basePerNight + promo.discountValue;
    }
    // si la moneda no coincide, no aplicamos
  } else if (promo.discountType === "price_override") {
    finalPerNight = Math.max(0, Math.abs(promo.discountValue));
  }

  finalPerNight = Math.max(0, Math.round(finalPerNight * 100) / 100);
  const deltaPerNight = +(finalPerNight - basePerNight).toFixed(2);
  const deltaTotal = +(deltaPerNight * nights).toFixed(2);
  const deltaPercent =
    basePerNight > 0
      ? Math.round(((finalPerNight - basePerNight) / basePerNight) * 100)
      : undefined;

  return {
    finalPerNight,
    appliedPromo: {
      promoId: promo.promoId,
      name: promo.name,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      deltaPerNight,
      deltaTotal,
      deltaPercent,
      code: promo.code,
    },
  };
}

function isCategoryEligible(promo: IPromo, categoryId: string): boolean {
  if (promo.appliesToAllCategories) return true;
  return Array.isArray(promo.categoryIds) && promo.categoryIds.includes(categoryId);
}

/**
 * Día civil en UTC (misma semántica que `YYYY-MM-DD` en ISO y que guarda el admin).
 * Evita el bug de mezclar setHours (local) con setUTCHours en la misma promo.
 */
function utcDayKey(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function utcDaysBetween(a: Date, b: Date): number {
  return Math.round((utcDayKey(b) - utcDayKey(a)) / 86400000);
}

function meetsRestrictions(promo: IPromo, nights: number, checkIn: Date): boolean {
  if (promo.minNights != null && nights < promo.minNights) return false;
  if (promo.minAdvanceDays != null) {
    const advance = utcDaysBetween(new Date(), checkIn);
    if (advance < promo.minAdvanceDays) return false;
  }
  // La estadía (checkIn) debe caer dentro del rango de validez (inclusivo) en días civil UTC.
  const check = utcDayKey(checkIn);
  if (promo.startDate) {
    const start = utcDayKey(new Date(promo.startDate));
    if (check < start) return false;
  }
  if (promo.endDate) {
    const end = utcDayKey(new Date(promo.endDate));
    if (check > end) return false;
  }
  return true;
}

/**
 * Decide el mejor precio aplicable. "Best deal wins": entre todas las promos
 * elegibles + la opción "sin promo", se queda con el menor finalPerNight.
 */
export function computePricing(input: PricingInput): PricingResult {
  const { basePerNight, currency, nights, checkIn, categoryId, candidates } = input;

  const baseTotal = +(basePerNight * nights).toFixed(2);
  const eligible = candidates.filter(
    (p) => isCategoryEligible(p, categoryId) && meetsRestrictions(p, nights, checkIn)
  );

  if (eligible.length === 0) {
    return {
      basePerNight,
      finalPerNight: basePerNight,
      finalTotal: baseTotal,
    };
  }

  const evaluated = eligible.map((p) => applyPromo(p, basePerNight, currency, nights));

  // Best deal wins: lowest finalPerNight. Si es peor que la base sin promo, no aplicamos.
  evaluated.sort((a, b) => a.finalPerNight - b.finalPerNight);
  const best = evaluated[0];

  if (best.finalPerNight >= basePerNight) {
    // Si la mejor promo es un surcharge y NO hay descuento, igual aplica (la base
    // sin promo no está en `eligible`, pero el caso típico de Temporada Alta
    // es que el surcharge sea "obligatorio"). Si querés que la base gane cuando
    // todas las promos suben el precio, comentá este return y descomentá el de abajo.
    return {
      basePerNight,
      finalPerNight: best.finalPerNight,
      finalTotal: +(best.finalPerNight * nights).toFixed(2),
      appliedPromo: best.appliedPromo,
      candidates: evaluated.map((e) => e.appliedPromo),
    };
    // Alternativa "base sin promo siempre disponible":
    // return { basePerNight, finalPerNight: basePerNight, finalTotal: baseTotal };
  }

  return {
    basePerNight,
    finalPerNight: best.finalPerNight,
    finalTotal: +(best.finalPerNight * nights).toFixed(2),
    appliedPromo: best.appliedPromo,
    candidates: evaluated.map((e) => e.appliedPromo),
  };
}
