import axios, { AxiosError } from "axios";

const CORE_API_URL = process.env.CORE_API_URL || "";
const ROOMS_API_URL = process.env.ROOMS_API_URL || "";

export interface CoreCategory {
  categoryId: string;
  name: string;
  description?: string;
  photos?: string[];
  capacity?: { adults: number; children: number };
  amenities?: string[];
  basePrice?: { amount: number; currency: string };
  unitCount?: number;
}

export interface CoreUnit {
  unitId: string;
  categoryId: string;
  status: string;
}

/**
 * Verifica que la propiedad existe y pertenece a la company.
 */
export async function verifyProperty(
  propertyId: string,
  companyId: string,
  token: string
): Promise<boolean> {
  if (!CORE_API_URL) {
    throw new Error("CORE_API_URL no configurado");
  }

  try {
    const { data } = await axios.get(
      `${CORE_API_URL}/api/v1/properties/${propertyId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { companyId },
        validateStatus: () => true,
      }
    );

    return data?.companyId === companyId;
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 404) {
      return false;
    }
    throw err;
  }
}

/**
 * Obtiene categorías de una propiedad desde rooms-app.
 * Usa el endpoint público (sin auth) cuando no se pasa token.
 */
export async function getCategories(
  propertyId: string,
  token?: string
): Promise<CoreCategory[]> {
  if (!ROOMS_API_URL) {
    return [];
  }

  try {
    const headers: Record<string, string> = {};
    const url = token
      ? `${ROOMS_API_URL}/api/v1/properties/${propertyId}/categories`
      : `${ROOMS_API_URL}/api/v1/public/properties/${propertyId}/categories`;

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const { data } = await axios.get<CoreCategory[]>(url, { headers });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/**
 * Obtiene unidades disponibles de una categoría desde rooms-app.
 */
export async function getAvailableUnits(
  propertyId: string,
  categoryId: string,
  token: string
): Promise<CoreUnit[]> {
  if (!ROOMS_API_URL) {
    throw new Error("ROOMS_API_URL no configurado");
  }

  const { data } = await axios.get<CoreUnit[]>(
    `${ROOMS_API_URL}/api/v1/properties/${propertyId}/units`,
    {
      headers: { Authorization: `Bearer ${token}` },
      params: { categoryId, status: "available" },
    }
  );

  return Array.isArray(data) ? data : [];
}

/**
 * Actualiza el estado de una unidad en rooms-app.
 */
export async function updateUnitStatus(
  propertyId: string,
  _categoryId: string,
  unitId: string,
  status: string,
  token: string
): Promise<void> {
  if (!ROOMS_API_URL) {
    throw new Error("ROOMS_API_URL no configurado");
  }

  await axios.patch(
    `${ROOMS_API_URL}/api/v1/properties/${propertyId}/units/${unitId}/status`,
    { status },
    { headers: { Authorization: `Bearer ${token}` } }
  );
}
