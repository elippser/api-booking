import axios from "axios";

const coreBase = () => (process.env.CORE_API_URL || "").replace(/\/$/, "");

/**
 * Los motores suelen mandar el slug de la URL; promos/rate plans en Mongo usan `propertyId` del core.
 * Si CORE_API_URL está definido, resuelve slug o id ambiguo vía endpoints públicos del core.
 */
export async function resolveBookingPropertyId(raw: string | undefined): Promise<string> {
  const id = (raw || "").trim();
  if (!id) return id;
  const core = coreBase();
  if (!core) return id;

  const looksUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  if (looksUuid) return id;
  if (/^prop-/i.test(id)) return id;

  const paths = [
    `${core}/api/v1/public/properties/by-slug/${encodeURIComponent(id)}`,
    `${core}/api/v1/public/properties/by-id/${encodeURIComponent(id)}`,
  ];

  for (const url of paths) {
    try {
      const { data, status } = await axios.get<{ propertyId?: string }>(url, {
        timeout: 10000,
        validateStatus: (s) => s === 200,
      });
      if (status === 200 && data?.propertyId && typeof data.propertyId === "string") {
        return data.propertyId.trim();
      }
    } catch {
      /* siguiente */
    }
  }
  return id;
}
