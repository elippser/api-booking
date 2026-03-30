import mongoose, { Document, Schema } from "mongoose";

export interface IAvailability extends Document {
  propertyId: string;
  categoryId: string;
  date: Date;
  totalUnits: number;
  reservedUnits: number;
  blockedUnits: number;
  availableUnits: number;
}

const AvailabilitySchema = new Schema<IAvailability>(
  {
    propertyId: { type: String, required: true },
    categoryId: { type: String, required: true },
    date: { type: Date, required: true },
    totalUnits: { type: Number, required: true, min: 0 },
    reservedUnits: { type: Number, default: 0, min: 0 },
    blockedUnits: { type: Number, default: 0, min: 0 },
    availableUnits: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

AvailabilitySchema.index({ propertyId: 1, categoryId: 1, date: 1 }, { unique: true });
AvailabilitySchema.index({ propertyId: 1, date: 1 });

export const Availability = mongoose.model<IAvailability>(
  "Availability",
  AvailabilitySchema
);
