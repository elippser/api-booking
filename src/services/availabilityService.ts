import { Availability } from "../models/Availability";
import { getCategories } from "./coreClient";
import { ratePlanService } from "./ratePlanService";

export interface AvailabilityResult {
  categoryId: string;
  name: string;
  description?: string;
  photos?: string[];
  capacity?: { adults: number; children: number };
  amenities?: string[];
  availableUnits: number;
  pricePerNight: number;
  totalAmount: number;
  currency: string;
  nights: number;
}

/**
 * Consultar disponibilidad por rango de fechas.
 */
export async function checkAvailability(
  propertyId: string,
  checkIn: Date,
  checkOut: Date,
  adults?: number,
  children?: number,
  token?: string
): Promise<AvailabilityResult[]> {
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  if (checkInDate >= checkOutDate) {
    throw new Error("checkOut debe ser posterior a checkIn");
  }

  const categories = await getCategories(propertyId, token);
  if (categories.length === 0) {
    return [];
  }

  const results: AvailabilityResult[] = [];

  const filtered = categories.filter((cat) => {
    if (!cat.capacity) return true;
    const meetsAdults = !adults || cat.capacity.adults >= adults;
    const meetsChildren = !children || cat.capacity.children >= (children ?? 0);
    return meetsAdults && meetsChildren;
  });

  for (const category of filtered) {
    const totalUnits = category.unitCount ?? 0;
    if (totalUnits <= 0) continue;

    const availabilityDocs = await Availability.find({
      propertyId,
      categoryId: category.categoryId,
      date: {
        $gte: checkInDate,
        $lt: checkOutDate,
      },
    }).lean();

    let minAvailable: number;

    if (availabilityDocs.length === 0) {
      // No availability docs yet = no reservations exist, all units free
      minAvailable = totalUnits;
    } else {
      minAvailable = Math.min(
        ...availabilityDocs.map((d) => d.availableUnits)
      );
    }

    if (minAvailable <= 0) {
      continue;
    }

    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    let priceInfo: { totalAmount: number; currency: string; pricePerNight: number };
    try {
      priceInfo = await ratePlanService.getPriceForRange(
        propertyId,
        category.categoryId,
        checkInDate,
        checkOutDate
      );
    } catch {
      const baseAmount = category.basePrice?.amount ?? 0;
      const baseCurrency = category.basePrice?.currency ?? "USD";
      priceInfo = {
        totalAmount: baseAmount * nights,
        currency: baseCurrency,
        pricePerNight: baseAmount,
      };
    }

    results.push({
      categoryId: category.categoryId,
      name: category.name,
      description: category.description,
      photos: category.photos,
      capacity: category.capacity,
      amenities: category.amenities,
      availableUnits: minAvailable,
      pricePerNight: priceInfo.pricePerNight,
      totalAmount: priceInfo.totalAmount,
      currency: priceInfo.currency,
      nights,
    });
  }

  return results;
}

/**
 * Actualizar disponibilidad al crear reserva.
 */
export async function decrementAvailability(
  propertyId: string,
  categoryId: string,
  checkIn: Date,
  checkOut: Date,
  totalUnitsFromRooms: number
): Promise<void> {
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  const currentDate = new Date(checkInDate);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate < checkOutDate) {
    let doc = await Availability.findOne({
      propertyId,
      categoryId,
      date: currentDate,
    });

    if (!doc) {
      doc = await Availability.create({
        propertyId,
        categoryId,
        date: new Date(currentDate),
        totalUnits: totalUnitsFromRooms,
        reservedUnits: 1,
        blockedUnits: 0,
        availableUnits: Math.max(0, totalUnitsFromRooms - 1),
      });
    } else {
      doc.reservedUnits += 1;
      doc.availableUnits = Math.max(
        0,
        doc.totalUnits - doc.reservedUnits - doc.blockedUnits
      );
      await doc.save();
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }
}

/**
 * Actualizar disponibilidad al cancelar reserva.
 */
export async function incrementAvailability(
  propertyId: string,
  categoryId: string,
  checkIn: Date,
  checkOut: Date
): Promise<void> {
  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);

  const currentDate = new Date(checkInDate);
  currentDate.setHours(0, 0, 0, 0);

  while (currentDate < checkOutDate) {
    const doc = await Availability.findOne({
      propertyId,
      categoryId,
      date: currentDate,
    });

    if (doc) {
      doc.reservedUnits = Math.max(0, doc.reservedUnits - 1);
      doc.availableUnits = doc.totalUnits - doc.reservedUnits - doc.blockedUnits;
      await doc.save();
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }
}

/**
 * Inicializar disponibilidad para una propiedad/categoría en un rango de fechas.
 */
export async function initializeAvailability(
  propertyId: string,
  categoryId: string,
  totalUnits: number,
  fromDate: Date,
  toDate: Date
): Promise<void> {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  from.setHours(0, 0, 0, 0);
  to.setHours(0, 0, 0, 0);

  const currentDate = new Date(from);

  while (currentDate <= to) {
    const existing = await Availability.findOne({
      propertyId,
      categoryId,
      date: currentDate,
    });

    if (!existing) {
      await Availability.create({
        propertyId,
        categoryId,
        date: new Date(currentDate),
        totalUnits,
        reservedUnits: 0,
        blockedUnits: 0,
        availableUnits: totalUnits,
      });
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }
}

export const availabilityService = {
  checkAvailability,
  decrementAvailability,
  incrementAvailability,
  initializeAvailability,
};
