import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const GUEST_JWT_SECRET = process.env.GUEST_JWT_SECRET || "";

export interface GuestJwtPayload {
  guestId: string;
  email: string;
}

export const authenticateGuest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    let token: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (req.cookies?.guest_token) {
      token = req.cookies.guest_token;
    }

    if (!token) {
      return res.status(401).json({ error: "Token de huésped no proporcionado" });
    }

    if (!GUEST_JWT_SECRET) {
      return res.status(500).json({ error: "Configuración de autenticación incompleta" });
    }

    const decoded = jwt.verify(token, GUEST_JWT_SECRET) as GuestJwtPayload;

    req.guest = {
      guestId: decoded.guestId,
      email: decoded.email,
    };

    next();
  } catch {
    return res.status(401).json({ error: "Token de huésped inválido o expirado" });
  }
};
