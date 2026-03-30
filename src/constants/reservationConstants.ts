export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "checked-in"
  | "checked-out"
  | "cancelled"
  | "no-show";

export type ReservationChannel = "direct" | "phone" | "ota";

export type PaymentCurrency = "ARS" | "USD" | "EUR" | "BRL";

// Transiciones válidas de estado
export const VALID_RESERVATION_TRANSITIONS: Record<
  ReservationStatus,
  ReservationStatus[]
> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["checked-in", "cancelled", "no-show"],
  "checked-in": ["checked-out"],
  "checked-out": [],
  cancelled: [],
  "no-show": [],
};
