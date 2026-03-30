/**
 * Schemas Joi para validación de entrada.
 * Agregar aquí los schemas compartidos o mover a archivos específicos por dominio.
 */
import Joi from "joi";

export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});
