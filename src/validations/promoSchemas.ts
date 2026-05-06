import Joi from "joi";

const studioSchema = Joi.object({
  showInWeb: Joi.boolean().default(false),
  image: Joi.string().uri().allow(""),
  title: Joi.string().max(200).allow(""),
  description: Joi.string().max(1000).allow(""),
  badge: Joi.string().max(60).allow(""),
  cta: Joi.string().max(60).allow(""),
});

const baseShape = {
  propertyId: Joi.string().required(),
  name: Joi.string().trim().max(200).required(),
  description: Joi.string().max(1000).allow(""),

  type: Joi.string().valid("auto", "code").required(),
  code: Joi.string().trim().max(40).when("type", {
    is: "code",
    then: Joi.required(),
    otherwise: Joi.optional().allow(""),
  }),

  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),

  appliesToAllCategories: Joi.boolean().default(true),
  categoryIds: Joi.when("appliesToAllCategories", {
    is: false,
    then: Joi.array()
      .items(Joi.string())
      .min(1)
      .required()
      .messages({
        "array.min": "Si la promo no aplica a todas las categorías, elegí al menos una.",
        "any.required": "Si la promo no aplica a todas las categorías, elegí al menos una.",
      }),
    otherwise: Joi.array().items(Joi.string()).default([]),
  }),

  discountType: Joi.string()
    .valid("percentage", "fixed_amount", "price_override")
    .required(),
  discountValue: Joi.number().required(),
  currency: Joi.string().uppercase().length(3).optional(),

  minNights: Joi.number().integer().min(1).optional(),
  minAdvanceDays: Joi.number().integer().min(0).optional(),
  maxUses: Joi.number().integer().min(1).optional(),
  oneUsePerGuest: Joi.boolean().default(false),

  isEnabled: Joi.boolean().default(true),
  studio: studioSchema.default(() => ({ showInWeb: false })),
};

export const promoCreateSchema = Joi.object(baseShape);

export const promoUpdateSchema = Joi.object({
  name: Joi.string().trim().max(200),
  description: Joi.string().max(1000).allow(""),
  type: Joi.string().valid("auto", "code"),
  code: Joi.string().trim().max(40).allow(""),
  startDate: Joi.date().iso().allow(null),
  endDate: Joi.date().iso().allow(null),
  appliesToAllCategories: Joi.boolean(),
  categoryIds: Joi.array().items(Joi.string()),
  discountType: Joi.string().valid("percentage", "fixed_amount", "price_override"),
  discountValue: Joi.number(),
  currency: Joi.string().uppercase().length(3).allow(""),
  minNights: Joi.number().integer().min(1).allow(null),
  minAdvanceDays: Joi.number().integer().min(0).allow(null),
  maxUses: Joi.number().integer().min(1).allow(null),
  oneUsePerGuest: Joi.boolean(),
  isEnabled: Joi.boolean(),
  studio: studioSchema,
}).min(1);

export const promoToggleSchema = Joi.object({
  isEnabled: Joi.boolean().required(),
});
