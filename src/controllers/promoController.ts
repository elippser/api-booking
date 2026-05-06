import { Request, Response } from "express";
import { catchAsync } from "../utils/catch/catchAsync";
import { promoService } from "../services/promoService";
import { resolveBookingPropertyId } from "../services/propertyResolveService";
import {
  promoCreateSchema,
  promoUpdateSchema,
  promoToggleSchema,
} from "../validations/promoSchemas";

export const listPromos = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { propertyId } = req.query as { propertyId?: string };
  if (!propertyId) {
    res.status(400).json({ error: "propertyId es requerido" });
    return;
  }
  const resolved = await resolveBookingPropertyId(propertyId);
  const promos = await promoService.list(resolved);
  res.status(200).json(promos);
});

export const getPromo = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { promoId } = req.params;
  const promo = await promoService.get(promoId);
  if (!promo) {
    res.status(404).json({ error: "Promo no encontrada" });
    return;
  }
  res.status(200).json(promo);
});

export const createPromo = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { error, value } = promoCreateSchema.validate(req.body, { abortEarly: false });
  if (error) {
    res.status(400).json({
      error: "Validación fallida",
      details: error.details.map((d) => d.message),
    });
    return;
  }
  try {
    const promo = await promoService.create(value);
    res.status(201).json(promo);
  } catch (e) {
    res.status(409).json({ error: e instanceof Error ? e.message : "Error" });
  }
});

export const updatePromo = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { error, value } = promoUpdateSchema.validate(req.body, { abortEarly: false });
  if (error) {
    res.status(400).json({
      error: "Validación fallida",
      details: error.details.map((d) => d.message),
    });
    return;
  }
  const { promoId } = req.params;
  try {
    const promo = await promoService.update(promoId, value);
    if (!promo) {
      res.status(404).json({ error: "Promo no encontrada" });
      return;
    }
    res.status(200).json(promo);
  } catch (e) {
    res.status(409).json({ error: e instanceof Error ? e.message : "Error" });
  }
});

export const togglePromo = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { error, value } = promoToggleSchema.validate(req.body, { abortEarly: false });
  if (error) {
    res.status(400).json({
      error: "Validación fallida",
      details: error.details.map((d) => d.message),
    });
    return;
  }
  const { promoId } = req.params;
  const promo = await promoService.toggle(promoId, value.isEnabled);
  if (!promo) {
    res.status(404).json({ error: "Promo no encontrada" });
    return;
  }
  res.status(200).json(promo);
});

export const deletePromo = catchAsync(async (req: Request, res: Response): Promise<void> => {
  const { promoId } = req.params;
  const ok = await promoService.remove(promoId);
  if (!ok) {
    res.status(404).json({ error: "Promo no encontrada" });
    return;
  }
  res.status(204).end();
});
