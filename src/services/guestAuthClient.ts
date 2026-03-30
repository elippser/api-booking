import axios, { AxiosError } from "axios";

const GUEST_AUTH_URL = process.env.GUEST_AUTH_URL || "";

/**
 * Valida token de huésped contra pms-auth-guests.
 */
export async function verifyGuestToken(
  token: string
): Promise<{ guestId: string; email: string } | null> {
  if (!GUEST_AUTH_URL) {
    throw new Error("GUEST_AUTH_URL no configurado");
  }

  try {
    const { data } = await axios.get<{ guestId: string; email: string }>(
      `${GUEST_AUTH_URL}/api/v1/auth/me`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (data?.guestId && data?.email) {
      return { guestId: data.guestId, email: data.email };
    }

    return null;
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 401) {
      return null;
    }
    throw err;
  }
}
