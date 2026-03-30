# pms-app-reservas — Plan de Implementación Backend
> Express · MongoDB · JWT dual (staff + guest) · Marzo 2026

---

## Responsabilidad

Backend central del sistema de reservas. Gestiona disponibilidad, reservas y tarifas. Sirve a dos frontends con audiencias distintas:
- frontend-pms — staff autenticado con JWT del pms-core
- frontend-motor — huéspedes autenticados con JWT de pms-auth-guests

---

## Estructura de archivos


backend/src/
├── constants/
│   └── reservationConstants.ts
├── models/
│   ├── Reservation.ts
│   ├── Availability.ts
│   └── RatePlan.ts
├── services/
│   ├── coreClient.ts           → valida property/category contra pms-core
│   ├── guestAuthClient.ts      → valida token de huésped contra pms-auth-guests
│   ├── availabilityService.ts
│   ├── ratePlanService.ts
│   └── reservationService.ts
├── controllers/
│   ├── availabilityController.ts
│   ├── ratePlanController.ts
│   └── reservationController.ts
├── routes/
│   ├── availabilityRouter.ts
│   ├── ratePlanRouter.ts
│   └── reservationRouter.ts
├── middleware/
│   ├── authenticateStaff.ts    → JWT del pms-core
│   ├── authenticateGuest.ts    → JWT de pms-auth-guests
│   └── requireRole.ts
├── validations/
│   └── schemas.ts
├── config/
│   └── dbCon.ts
├── utils/
│   ├── catchAsync.ts
│   ├── logger.ts
│   └── generateReservationCode.ts
├── types/
│   └── express.d.ts
├── server.ts
└── index.ts


---

## Variables de entorno

env
PORT=5001
MONGODB_URI=                  # DB propia de reservas
STAFF_JWT_SECRET=             # mismo que pms-core JWT_SECRET
GUEST_JWT_SECRET=             # mismo que pms-auth-guests JWT_SECRET
CORE_API_URL=                 # URL del backend pms-core
GUEST_AUTH_URL=               # URL del backend pms-auth-guests
ROOMS_API_URL=                # URL del backend pms-app-habitaciones
NODE_ENV=development


---

## Constantes

Archivo: src/constants/reservationConstants.ts

typescript
export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "checked-in"
  | "checked-out"
  | "cancelled"
  | "no-show";

export type ReservationChannel =
  | "direct"
  | "phone"
  | "ota";

export type PaymentCurrency =
  | "ARS" | "USD" | "EUR" | "BRL";

// Transiciones válidas de estado
export const VALID_RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["checked-in", "cancelled", "no-show"],
  "checked-in": ["checked-out"],
  "checked-out": [],
  cancelled: [],
  "no-show": [],
};


---

## Modelos

### Reservation.ts

typescript
interface IReservation extends Document {
  reservationId: string;        // "res-{uuid}"
  reservationCode: string;      // "RES-2026-XXXX" — visible para el huésped

  // Contexto
  propertyId: string;           // ref a pms-core
  categoryId: string;           // ref a pms-app-habitaciones
  assignedUnitId?: string;      // se completa en check-in

  // Huésped
  guestId: string;              // ref a pms-auth-guests

  // Fechas
  checkIn: Date;
  checkOut: Date;
  nights: number;               // calculado: checkOut - checkIn en días

  // Ocupantes
  adults: number;
  children: number;

  // Precio
  totalAmount: number;
  currency: string;

  // Estado
  status: ReservationStatus;
  channel: ReservationChannel;

  // Detalles
  specialRequests?: string;
  internalNotes?: string;

  // Cancelación
  cancelledAt?: Date;
  cancelledReason?: string;

  // Auditoría
  createdByUserId?: string;     // staff que creó la reserva (si es carga manual)
  createdAt: Date;
  updatedAt: Date;
}


*Schema Mongoose:*
typescript
const ReservationSchema = new Schema<IReservation>(
  {
    reservationId: { type: String, required: true, unique: true },
    reservationCode: { type: String, required: true, unique: true },

    propertyId: { type: String, required: true },
    categoryId: { type: String, required: true },
    assignedUnitId: { type: String },

    guestId: { type: String, required: true },

    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    nights: { type: Number, required: true, min: 1 },

    adults: { type: Number, required: true, min: 1 },
    children: { type: Number, default: 0, min: 0 },

    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, default: "USD" },

    status: {
      type: String,
      enum: ["pending","confirmed","checked-in","checked-out","cancelled","no-show"],
      default: "pending"
    },
    channel: {
      type: String,
      enum: ["direct","phone","ota"],
      required: true
    },

    specialRequests: { type: String, maxlength: 1000 },
    internalNotes: { type: String, maxlength: 1000 },

    cancelledAt: { type: Date },
    cancelledReason: { type: String },
    createdByUserId: { type: String }
  },
  { timestamps: true }
);

ReservationSchema.index({ reservationId: 1 });
ReservationSchema.index({ reservationCode: 1 });
ReservationSchema.index({ propertyId: 1 });
ReservationSchema.index({ guestId: 1 });
ReservationSchema.index({ categoryId: 1 });
ReservationSchema.index({ status: 1 });
ReservationSchema.index({ checkIn: 1, checkOut: 1 });
ReservationSchema.index({ propertyId: 1, status: 1, checkIn: 1 });


---

### Availability.ts

Un documento por día por categoría. Se actualiza cada vez que se crea, modifica o cancela una reserva.

typescript
interface IAvailability extends Document {
  propertyId: string;
  categoryId: string;
  date: Date;                   // fecha exacta (sin hora, solo día)
  totalUnits: number;           // unidades activas en esa categoría
  reservedUnits: number;        // reservadas ese día
  blockedUnits: number;         // en mantenimiento/bloqueadas
  availableUnits: number;       // totalUnits - reservedUnits - blockedUnits
}


*Schema Mongoose:*
typescript
const AvailabilitySchema = new Schema<IAvailability>(
  {
    propertyId: { type: String, required: true },
    categoryId: { type: String, required: true },
    date: { type: Date, required: true },
    totalUnits: { type: Number, required: true, min: 0 },
    reservedUnits: { type: Number, default: 0, min: 0 },
    blockedUnits: { type: Number, default: 0, min: 0 },
    availableUnits: { type: Number, required: true, min: 0 }
  },
  { timestamps: true }
);

// Único por propiedad + categoría + día
AvailabilitySchema.index({ propertyId: 1, categoryId: 1, date: 1 }, { unique: true });
AvailabilitySchema.index({ propertyId: 1, date: 1 });


---

### RatePlan.ts

typescript
interface IRatePlan extends Document {
  ratePlanId: string;           // "rate-{uuid}"
  propertyId: string;
  categoryId: string;
  name: string;                 // "Temporada Alta 2026", "Semana Santa"
  startDate: Date;
  endDate: Date;
  pricePerNight: number;
  currency: string;
  minNights?: number;           // mínimo de noches para aplicar este plan
  isActive: boolean;
  createdByUserId: string;
}


*Schema Mongoose:*
typescript
const RatePlanSchema = new Schema<IRatePlan>(
  {
    ratePlanId: { type: String, required: true, unique: true },
    propertyId: { type: String, required: true },
    categoryId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    pricePerNight: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, uppercase: true, default: "USD" },
    minNights: { type: Number, min: 1 },
    isActive: { type: Boolean, default: true },
    createdByUserId: { type: String, required: true }
  },
  { timestamps: true }
);

RatePlanSchema.index({ ratePlanId: 1 });
RatePlanSchema.index({ propertyId: 1, categoryId: 1 });
RatePlanSchema.index({ propertyId: 1, startDate: 1, endDate: 1 });
RatePlanSchema.index({ propertyId: 1, isActive: 1 });


---

## Clients externos

### coreClient.ts
typescript
// Verifica que property existe y pertenece a la company
verifyProperty(propertyId: string, companyId: string, token: string): Promise<boolean>

// Obtiene categorías de una propiedad desde pms-app-habitaciones
getCategories(propertyId: string, token: string): Promise<CoreCategory[]>

// Obtiene unidades disponibles de una categoría
getAvailableUnits(propertyId: string, categoryId: string, token: string): Promise<CoreUnit[]>


### guestAuthClient.ts
typescript
// Valida token de huésped contra pms-auth-guests
verifyGuestToken(token: string): Promise<{ guestId: string; email: string } | null>


---

## Middlewares

### authenticateStaff.ts
- Lee JWT de Authorization: Bearer o cookie app_token
- Verifica con STAFF_JWT_SECRET
- Puebla req.user = { userId, companyId, role }

### authenticateGuest.ts
- Lee JWT de Authorization: Bearer o cookie guest_token
- Verifica con GUEST_JWT_SECRET
- Puebla req.guest = { guestId, email }

### requireRole.ts
- Mismo patrón que pms-core
- Solo aplica a rutas de staff

---

## Services

### availabilityService.ts

typescript
// Consultar disponibilidad por rango de fechas
checkAvailability(propertyId, checkIn, checkOut): Promise<AvailabilityResult[]>
  → Para cada categoría activa de la propiedad:
    1. Buscar docs en Availability donde date está en el rango
    2. El mínimo de availableUnits en el rango es la disponibilidad real
    3. Buscar RatePlan activo que cubra el rango → calcular totalAmount
    4. Si no hay RatePlan → usar basePrice de la categoría como fallback
    5. Retornar categorías con availableUnits > 0

// Actualizar disponibilidad al crear reserva
decrementAvailability(propertyId, categoryId, checkIn, checkOut): Promise<void>
  → Para cada día del rango:
    1. Buscar doc en Availability para ese día
    2. Si no existe → crear con totalUnits desde habitaciones
    3. reservedUnits += 1
    4. availableUnits = totalUnits - reservedUnits - blockedUnits

// Actualizar disponibilidad al cancelar reserva
incrementAvailability(propertyId, categoryId, checkIn, checkOut): Promise<void>
  → Inverso de decrement

// Inicializar disponibilidad para una propiedad
initializeAvailability(propertyId, categoryId, totalUnits, fromDate, toDate): Promise<void>
  → Crea docs de Availability para el rango dado
  → Se llama cuando se agregan unidades nuevas a una categoría


### ratePlanService.ts

typescript
createRatePlan(payload, userId): Promise<IRatePlan>
listRatePlans(propertyId, categoryId?): Promise<IRatePlan[]>
getRatePlan(ratePlanId): Promise<IRatePlan>
updateRatePlan(ratePlanId, payload): Promise<IRatePlan>
deleteRatePlan(ratePlanId): Promise<void>   // soft delete: isActive = false

// Obtener precio para un rango de fechas
getPriceForRange(categoryId, checkIn, checkOut): Promise<{ totalAmount, currency, pricePerNight }>
  1. Buscar RatePlan activo donde startDate <= checkIn y endDate >= checkOut
  2. Si hay RatePlan y minNights se cumple → usar su precio
  3. Si no → usar basePrice de la categoría desde habitaciones
  4. totalAmount = pricePerNight * nights


### reservationService.ts

typescript
// Crear reserva (desde motor — huésped)
createReservationFromMotor(payload, guestId): Promise<IReservation>
  1. Verificar disponibilidad en el rango
  2. Calcular totalAmount via getPriceForRange
  3. Generar reservationId = "res-{uuid}"
  4. Generar reservationCode = "RES-{AÑO}-{4 chars aleatorios uppercase}"
  5. Crear Reservation con status: "pending", channel: "direct"
  6. decrementAvailability()
  7. Retornar reserva

// Crear reserva (desde PMS — staff)
createReservationFromPMS(payload, userId): Promise<IReservation>
  → Mismo flujo pero con channel desde el body (direct/phone/ota)
  → createdByUserId = userId
  → status inicial: "confirmed" (el staff confirma en el acto)

// Listar reservas de una propiedad (para staff)
listReservations(propertyId, filters): Promise<IReservation[]>
  → Filtros: status, checkIn, checkOut, guestId, channel

// Listar reservas de un huésped (para el motor/perfil)
listGuestReservations(guestId): Promise<IReservation[]>

// Cambiar estado
updateReservationStatus(reservationId, newStatus, userId, reason?): Promise<IReservation>
  1. Validar transición contra VALID_RESERVATION_TRANSITIONS
  2. Si newStatus === "checked-in" → asignar unidad disponible automáticamente
  3. Si newStatus === "cancelled" → incrementAvailability() + guardar cancelledAt y reason
  4. Si newStatus === "checked-out" → liberar unidad asignada

// Asignar unidad en check-in
assignUnit(reservationId, propertyId, categoryId): Promise<string>
  → Buscar primera unidad con status "available" en esa categoría
  → Si no hay → throw error "No hay unidades disponibles para esta categoría"
  → Actualizar unidad a "occupied" en pms-app-habitaciones
  → Retornar unitId asignado


---

## Endpoints

Base: /api/v1

### Disponibilidad (público para el motor)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| GET | /availability | no | Consultar disponibilidad por propiedad y fechas |

*Query params:*

?propertyId=prop-xxx&checkIn=2026-04-01&checkOut=2026-04-05&adults=2&children=0


*Respuesta 200:*
json
[
  {
    "categoryId": "cat-...",
    "name": "Habitación Doble Estándar",
    "description": "...",
    "photos": ["..."],
    "capacity": { "adults": 2, "children": 1 },
    "amenities": ["WiFi", "AC"],
    "availableUnits": 3,
    "pricePerNight": 150,
    "totalAmount": 600,
    "currency": "USD",
    "nights": 4
  }
]


---

### Rate Plans (solo staff)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | /rate-plans | staff owner·admin | Crear plan tarifario |
| GET | /rate-plans | staff | Listar planes de una propiedad |
| GET | /rate-plans/:ratePlanId | staff | Detalle de un plan |
| PATCH | /rate-plans/:ratePlanId | staff owner·admin | Editar plan |
| DELETE | /rate-plans/:ratePlanId | staff owner·admin | Soft delete |

*Query params para GET /rate-plans:*

?propertyId=prop-xxx&categoryId=cat-xxx


---

### Reservas — Staff

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | /reservations | staff | Carga manual de reserva |
| GET | /reservations | staff | Listar reservas de una propiedad |
| GET | /reservations/:reservationId | staff | Detalle de reserva |
| PATCH | /reservations/:reservationId/status | staff | Cambiar estado |
| PATCH | /reservations/:reservationId/notes | staff | Actualizar notas internas |

*Query params para GET /reservations:*

?propertyId=prop-xxx&status=confirmed&checkIn=2026-04-01&checkOut=2026-04-30


---

### Reservas — Motor (huésped autenticado)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | /motor/reservations | guest JWT | Crear reserva desde el motor |
| GET | /motor/reservations | guest JWT | Listar reservas del huésped |
| GET | /motor/reservations/:reservationId | guest JWT | Detalle de reserva |
| PATCH | /motor/reservations/:reservationId/cancel | guest JWT | Cancelar reserva |

---

## Utilidad — generateReservationCode.ts

typescript
export const generateReservationCode = (): string => {
  const year = new Date().getFullYear();
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const random = Array.from({ length: 4 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
  return `RES-${year}-${random}`;
};


Verificar unicidad al crear: si colisiona regenerar hasta encontrar uno libre.

---

## Notas críticas

*Orden de rutas en reservationRouter:*
typescript
// Rutas estáticas ANTES que rutas con parámetros
router.get("/motor/reservations", ...)        // primero
router.get("/reservations", ...)              // primero
router.get("/reservations/:reservationId", .) // después


*Atomicidad en disponibilidad:*
La creación de reserva y el decremento de disponibilidad deben ocurrir en la misma operación lógica. Si el decremento falla, la reserva no se crea. Usar try/catch con rollback manual.

*Check-in y asignación de unidad:*
Al hacer check-in el sistema asigna automáticamente la primera unidad disponible de la categoría. Si no hay unidades disponibles el endpoint responde 409 con mensaje claro.

---

## Orden de implementación


1.  src/constants/reservationConstants.ts
2.  src/utils/catchAsync.ts + logger.ts + generateReservationCode.ts
3.  src/types/express.d.ts
4.  src/config/dbCon.ts
5.  src/models/Availability.ts
6.  src/models/RatePlan.ts
7.  src/models/Reservation.ts
8.  src/middleware/authenticateStaff.ts
9.  src/middleware/authenticateGuest.ts
10. src/middleware/requireRole.ts
11. src/services/coreClient.ts
12. src/services/guestAuthClient.ts
13. src/services/availabilityService.ts
14. src/services/ratePlanService.ts
15. src/services/reservationService.ts
16. src/controllers/availabilityController.ts
17. src/controllers/ratePlanController.ts
18. src/controllers/reservationController.ts
19. src/validations/schemas.ts
20. src/routes/availabilityRouter.ts
21. src/routes/ratePlanRouter.ts
22. src/routes/reservationRouter.ts
23. src/server.ts
24. src/index.ts