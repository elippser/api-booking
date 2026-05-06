import mongoose, { Document, Schema } from "mongoose";

/**
 * Vista read-only de la colección `guests` (administrada por guests-app).
 * Compartimos DB y solo necesitamos leer el resumen del huésped al listar reservas.
 */

export interface IGuestDocument {
  type: "dni" | "passport" | "other";
  number: string;
}

export interface IGuest extends Document {
  guestId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  document: IGuestDocument;
  nationality: string;
  status: "active" | "suspended" | "deleted";
}

const guestDocumentSchema = new Schema<IGuestDocument>(
  {
    type: { type: String, enum: ["dni", "passport", "other"] },
    number: { type: String },
  },
  { _id: false }
);

const guestSchema = new Schema<IGuest>(
  {
    guestId: { type: String, required: true, unique: true, index: true },
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String },
    document: { type: guestDocumentSchema },
    nationality: { type: String, uppercase: true },
    status: {
      type: String,
      enum: ["active", "suspended", "deleted"],
    },
  },
  { collection: "guests", strict: false, timestamps: false }
);

export const Guest = mongoose.model<IGuest>("Guest", guestSchema);

export interface GuestSummary {
  guestId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  document: { type: string; number: string };
  nationality: string;
}

export async function getGuestSummariesMap(
  guestIds: string[]
): Promise<Map<string, GuestSummary>> {
  const unique = Array.from(new Set(guestIds.filter(Boolean)));
  if (unique.length === 0) return new Map();

  const docs = await Guest.find(
    { guestId: { $in: unique } },
    { guestId: 1, firstName: 1, lastName: 1, email: 1, phone: 1, document: 1, nationality: 1 }
  ).lean();

  const map = new Map<string, GuestSummary>();
  for (const d of docs) {
    map.set(d.guestId, {
      guestId: d.guestId,
      firstName: d.firstName ?? "",
      lastName: d.lastName ?? "",
      email: d.email ?? "",
      phone: d.phone ?? "",
      document: {
        type: d.document?.type ?? "",
        number: d.document?.number ?? "",
      },
      nationality: d.nationality ?? "",
    });
  }
  return map;
}
