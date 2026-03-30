import Joi from "joi";

export const availabilityQuerySchema = Joi.object({
  propertyId: Joi.string().required(),
  checkIn: Joi.date().iso().required(),
  checkOut: Joi.date().iso().greater(Joi.ref("checkIn")).required(),
  adults: Joi.number().integer().min(1).default(1),
  children: Joi.number().integer().min(0).default(0),
});

export const ratePlanCreateSchema = Joi.object({
  propertyId: Joi.string().required(),
  categoryId: Joi.string().required(),
  name: Joi.string().required().trim().max(200),
  startDate: Joi.date().iso().required(),
  endDate: Joi.date().iso().min(Joi.ref("startDate")).required(),
  pricePerNight: Joi.number().min(0).required(),
  currency: Joi.string().valid("ARS", "USD", "EUR", "BRL").default("USD"),
  minNights: Joi.number().integer().min(1),
});

export const ratePlanUpdateSchema = Joi.object({
  name: Joi.string().trim().max(200),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso(),
  pricePerNight: Joi.number().min(0),
  currency: Joi.string().valid("ARS", "USD", "EUR", "BRL"),
  minNights: Joi.number().integer().min(1),
}).min(1);

export const reservationCreateSchema = Joi.object({
  propertyId: Joi.string().required(),
  categoryId: Joi.string().required(),
  guestId: Joi.string().required(),
  checkIn: Joi.date().iso().required(),
  checkOut: Joi.date().iso().greater(Joi.ref("checkIn")).required(),
  adults: Joi.number().integer().min(1).required(),
  children: Joi.number().integer().min(0).default(0),
  specialRequests: Joi.string().max(1000),
  channel: Joi.string().valid("direct", "phone", "ota"),
});

export const reservationMotorCreateSchema = Joi.object({
  propertyId: Joi.string().required(),
  categoryId: Joi.string().required(),
  checkIn: Joi.date().iso().required(),
  checkOut: Joi.date().iso().greater(Joi.ref("checkIn")).required(),
  adults: Joi.number().integer().min(1).required(),
  children: Joi.number().integer().min(0).default(0),
  specialRequests: Joi.string().max(1000).allow(""),
}).options({ stripUnknown: true });

export const reservationListQuerySchema = Joi.object({
  propertyId: Joi.string().required(),
  status: Joi.string().valid(
    "pending",
    "confirmed",
    "checked-in",
    "checked-out",
    "cancelled",
    "no-show"
  ),
  checkIn: Joi.date().iso(),
  checkOut: Joi.date().iso(),
  guestId: Joi.string(),
  channel: Joi.string().valid("direct", "phone", "ota"),
});

export const updateStatusSchema = Joi.object({
  status: Joi.string()
    .valid(
      "pending",
      "confirmed",
      "checked-in",
      "checked-out",
      "cancelled",
      "no-show"
    )
    .required(),
  reason: Joi.string().max(500),
});

export const updateNotesSchema = Joi.object({
  internalNotes: Joi.string().max(1000).allow(""),
});

export const availabilityInitSchema = Joi.object({
  propertyId: Joi.string().required(),
  categoryId: Joi.string().required(),
  totalUnits: Joi.number().integer().min(1).required(),
  fromDate: Joi.date().iso().required(),
  toDate: Joi.date().iso().greater(Joi.ref("fromDate")).required(),
});
