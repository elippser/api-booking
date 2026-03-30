import mongoose, { Document, Schema } from "mongoose";

export interface IRatePlan extends Document {
  ratePlanId: string;
  propertyId: string;
  categoryId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  pricePerNight: number;
  currency: string;
  minNights?: number;
  isActive: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

const RatePlanSchema = new Schema<IRatePlan>(
  {
    ratePlanId: { type: String, required: true, unique: true },
    propertyId: { type: String, required: true },
    categoryId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    pricePerNight: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, default: "USD" },
    minNights: { type: Number, min: 1 },
    isActive: { type: Boolean, default: true },
    createdByUserId: { type: String, required: true },
  },
  { timestamps: true }
);

RatePlanSchema.index({ propertyId: 1, categoryId: 1 });
RatePlanSchema.index({ propertyId: 1, startDate: 1, endDate: 1 });
RatePlanSchema.index({ propertyId: 1, isActive: 1 });

export const RatePlan = mongoose.model<IRatePlan>("RatePlan", RatePlanSchema);
