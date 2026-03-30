import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import axios from "axios";

/** Mismo secreto con el que pms-core/api firma el login (`JWT_SECRET`). */
const STAFF_JWT_SECRET =
  process.env.STAFF_JWT_SECRET || process.env.JWT_SECRET || "";

export interface StaffJwtPayload {
  userId: string;
  companyId: string;
  role: string;
}

function normalizeCoreUrl(): string {
  const raw = process.env.CORE_API_URL?.trim();
  if (!raw) return "";
  return raw.replace(/\/$/, "");
}

/**
 * Valida el Bearer contra pms-core (GET /user/profile) cuando no hay secreto local
 * o la verificación JWT local falla (p. ej. secreto distinto en dev).
 */
async function resolveUserFromCore(
  token: string
): Promise<StaffJwtPayload | null> {
  const base = normalizeCoreUrl();
  if (!base) return null;

  try {
    const { status, data } = await axios.get(`${base}/user/profile`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
      validateStatus: () => true,
    });

    if (status !== 200 || !data || typeof data.userId !== "string") {
      return null;
    }

    const companyId =
      (typeof data.activeCompany === "string" && data.activeCompany) ||
      (typeof data.companyId === "string" && data.companyId) ||
      "";
    const role = typeof data.role === "string" ? data.role : "";

    if (!companyId) return null;

    return {
      userId: data.userId,
      companyId,
      role,
    };
  } catch {
    return null;
  }
}

function tryVerifyLocalJwt(token: string): StaffJwtPayload | null {
  if (!STAFF_JWT_SECRET) return null;
  try {
    return jwt.verify(token, STAFF_JWT_SECRET) as StaffJwtPayload;
  } catch {
    return null;
  }
}

export const authenticateStaff = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> => {
  try {
    let token: string | null = null;

    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (req.cookies?.app_token) {
      token = req.cookies.app_token;
    }

    if (!token) {
      return res.status(401).json({ error: "Token no proporcionado" });
    }

    const hasLocalSecret = Boolean(STAFF_JWT_SECRET);
    const hasCoreUrl = Boolean(normalizeCoreUrl());

    if (!hasLocalSecret && !hasCoreUrl) {
      return res.status(500).json({
        error:
          "Configuración de autenticación incompleta: definí STAFF_JWT_SECRET o CORE_API_URL",
      });
    }

    let payload = tryVerifyLocalJwt(token);
    if (!payload) {
      payload = await resolveUserFromCore(token);
    }

    if (!payload) {
      return res.status(401).json({ error: "Token inválido o expirado" });
    }

    req.user = {
      userId: payload.userId,
      companyId: payload.companyId,
      role: payload.role,
    };

    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
};
