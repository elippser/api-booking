import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logs/logger";

export const errorHandler = (
  err: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Error interno del servidor";

  logger.error(`${statusCode} - ${message} - ${err.stack}`);

  res.status(statusCode).json({
    error: message,
  });
};
