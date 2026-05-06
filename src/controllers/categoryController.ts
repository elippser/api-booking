import { Request, Response } from "express";
import { catchAsync } from "../utils/catch/catchAsync";
import { getCategoriesWithLocalFallback } from "../services/categoryResilience";

export const listCategories = catchAsync(
  async (req: Request, res: Response): Promise<void> => {
    const { propertyId } = req.query as { propertyId?: string };

    if (!propertyId) {
      res.status(400).json({ error: "propertyId es requerido" });
      return;
    }

    // El staff JWT del PMS no es válido contra rooms-app (cada API tiene su
    // propio JWT_SECRET). Usamos el endpoint público de rooms para listar
    // categorías; la autenticación de staff la sigue exigiendo el router.
    const categories = await getCategoriesWithLocalFallback(propertyId);
    res.status(200).json(categories);
  }
);
