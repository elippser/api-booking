import mongoose, { Document, Schema } from "mongoose";

export type PromoType = "auto" | "code";
export type PromoDiscountType = "percentage" | "fixed_amount" | "price_override";

export interface IPromoStudio {
  showInWeb: boolean;
  image?: string;
  title?: string;
  description?: string;
  badge?: string;
  cta?: string;
}

export interface IPromo extends Document {
  promoId: string;
  propertyId: string;

  name: string;
  description?: string;

  type: PromoType;
  code?: string;

  startDate?: Date;
  endDate?: Date;

  appliesToAllCategories: boolean;
  categoryIds: string[];

  discountType: PromoDiscountType;
  /**
   * Signed magnitude.
   * percentage: -30 = 30% OFF, +30 = 30% surcharge.
   * fixed_amount: signed money in `currency`.
   * price_override: positive flat price/night (sign ignored).
   */
  discountValue: number;
  currency?: string; // for fixed_amount / price_override

  minNights?: number;
  minAdvanceDays?: number;
  maxUses?: number;
  oneUsePerGuest: boolean;

  isEnabled: boolean;

  studio: IPromoStudio;

  createdAt: Date;
  updatedAt: Date;
}

const studioSchema = new Schema<IPromoStudio>(
  {
    showInWeb: { type: Boolean, default: false },
    image: { type: String },
    title: { type: String, maxlength: 200 },
    description: { type: String, maxlength: 1000 },
    badge: { type: String, maxlength: 60 },
    cta: { type: String, maxlength: 60 },
  },
  { _id: false }
);

const promoSchema = new Schema<IPromo>(
  {
    promoId: { type: String, required: true, unique: true, index: true },
    propertyId: { type: String, required: true, index: true },

    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 1000 },

    type: { type: String, enum: ["auto", "code"], required: true },
    code: { type: String, uppercase: true, trim: true },

    startDate: { type: Date },
    endDate: { type: Date },

    appliesToAllCategories: { type: Boolean, default: true },
    categoryIds: { type: [String], default: [] },

    discountType: {
      type: String,
      enum: ["percentage", "fixed_amount", "price_override"],
      required: true,
    },
    discountValue: { type: Number, required: true },
    currency: { type: String, uppercase: true },

    minNights: { type: Number, min: 1 },
    minAdvanceDays: { type: Number, min: 0 },
    maxUses: { type: Number, min: 1 },
    oneUsePerGuest: { type: Boolean, default: false },

    isEnabled: { type: Boolean, default: true },

    studio: { type: studioSchema, default: () => ({ showInWeb: false }) },
  },
  { timestamps: true }
);

// Códigos únicos por propiedad (no globalmente — distintos hoteles pueden usar el mismo).
promoSchema.index(
  { propertyId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: "string" } } }
);
promoSchema.index({ propertyId: 1, isEnabled: 1, startDate: 1, endDate: 1 });

export const Promo = mongoose.model<IPromo>("Promo", promoSchema);

export type PromoStatus = "active" | "scheduled" | "expired" | "inactive";

export function derivePromoStatus(p: Pick<IPromo, "isEnabled" | "startDate" | "endDate">): PromoStatus {
  if (!p.isEnabled) return "inactive";
  const now = new Date();
  if (p.endDate && p.endDate < now) return "expired";
  if (p.startDate && p.startDate > now) return "scheduled";
  return "active";
}
