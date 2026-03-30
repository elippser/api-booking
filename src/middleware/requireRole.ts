import { Request, Response, NextFunction } from "express";

/**
 * Middleware que verifica que el usuario staff tenga uno de los roles permitidos.
 * Debe usarse después de authenticateStaff.
 */
export const requireRole = (...allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void | Response => {
    if (!req.user) {
      return res.status(401).json({ error: "No autenticado" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "No tiene permisos para realizar esta acción",
      });
    }

    next();
  };
};
