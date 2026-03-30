import mongoose, { Document, Schema } from "mongoose";
import {
  ReservationStatus,
  ReservationChannel,
} from "../constants/reservationConstants";

export interface IReservation extends Document {
  reservationId: string;
  reservationCode: string;
  propertyId: string;
  categoryId: string;
  assignedUnitId?: string;
  guestId: string;
  checkIn: Date;
  checkOut: Date;
  nights: number;
  adults: number;
  children: number;
  totalAmount: number;
  currency: string;
  status: ReservationStatus;
  channel: ReservationChannel;
  specialRequests?: string;
  internalNotes?: string;
  cancelledAt?: Date;
  cancelledReason?: string;
  createdByUserId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ReservationSchema = new Schema<IReservation>(
  {
    reservationId: { type: String, required: true, unique: true },
    reservationCode: { type: String, required: true, unique: true },
    propertyId: { type: String, required: true },
    categoryId: { type: String, required: true },
    assignedUnitId: { type: String },
    guestId: { type: String, required: true },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    nights: { type: Number, required: true, min: 1 },
    adults: { type: Number, required: true, min: 1 },
    children: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, default: "USD" },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "checked-in",
        "checked-out",
        "cancelled",
        "no-show",
      ],
      default: "pending",
    },
    channel: {
      type: String,
      enum: ["direct", "phone", "ota"],
      required: true,
    },
    specialRequests: { type: String, maxlength: 1000 },
    internalNotes: { type: String, maxlength: 1000 },
    cancelledAt: { type: Date },
    cancelledReason: { type: String },
    createdByUserId: { type: String },
  },
  { timestamps: true }
);

ReservationSchema.index({ propertyId: 1 });
ReservationSchema.index({ guestId: 1 });
ReservationSchema.index({ categoryId: 1 });
ReservationSchema.index({ status: 1 });
ReservationSchema.index({ checkIn: 1, checkOut: 1 });
ReservationSchema.index({ propertyId: 1, status: 1, checkIn: 1 });

export const Reservation = mongoose.model<IReservation>(
  "Reservation",
  ReservationSchema
);
