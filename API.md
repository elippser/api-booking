# API — `elippser-pms-booking-api`

Documentación de los endpoints HTTP expuestos por `booking-app/api`. Los prefijos de ruta reflejan el montaje en `src/routes/index.ts`.

---

## 1. Convenciones generales

### 1.1 Base y formato

- **Puerto por defecto**: `7070` (`process.env.PORT`).
- **Content-Type**: `application/json` en cuerpos de petición y respuesta (salvo `204 No Content`).
- **CORS**: `origin: true`, `credentials: true` (`src/server.ts`).
- **Cookies**: se usa `cookie-parser`; varios flujos aceptan token en cookie además del header `Authorization`.

### 1.2 Health check

| Método | Ruta | Auth |
|--------|------|------|
| `GET` | `/health` | No |

**Respuesta `200`**

```json
{ "status": "ok" }
```

> **Nota**: En `server.ts`, el middleware que llama a `connectDB()` se aplica a todas las peticiones posteriores a `/health`. La primera petición a rutas bajo `app.use(routes)` garantiza intento de conexión a MongoDB.

### 1.3 Errores de validación (Joi)

Cuando un controlador valida con Joi y falla, la respuesta es **`400`** con cuerpo:

```json
{
  "error": "Validación fallida",
  "details": ["<mensaje Joi 1>", "..."]
}
```

### 1.4 Errores de negocio y no capturados

- Los controladores usan `catchAsync`, que reenvía excepciones al `errorHandler`.
- **`errorHandler`** (`src/middleware/errorHandler.ts`) responde **`500`** por defecto (o el `statusCode` del error si existiera en el objeto `Error`).
- Mensajes típicos lanzados por servicios (ej. `"No hay disponibilidad para la categoría seleccionada"`, `"Transición de estado inválida: ..."`) llegan al cliente como `{ "error": "<message>" }` con código **500**, salvo que el error lleve `statusCode` (el código actual no asigna códigos HTTP específicos en la mayoría de los `throw new Error(...)`).

### 1.5 Autenticación staff (PMS / backoffice)

**Middleware**: `authenticateStaff` (`src/middleware/authenticateStaff.ts`).

El token se obtiene en este orden:

1. `Authorization: Bearer <jwt>`
2. Cookie `app_token`

**Resolución del JWT**

1. Si existe `STAFF_JWT_SECRET` o `JWT_SECRET`, se intenta `jwt.verify` local.
2. Si falla o no hay secreto, y `CORE_API_URL` está definido, se valida contra **pms-core**: `GET {CORE_API_URL}/user/profile` con el mismo `Authorization`.
3. Si no hay ni secreto local ni `CORE_API_URL`: **`500`** `"Configuración de autenticación incompleta..."`.
4. Token inválido: **`401`** `{ "error": "Token inválido o expirado" }` (o `"Token no proporcionado"`).

**Payload expuesto en `req.user`** (extensión en `src/types/express.d.ts`):

- `userId`, `companyId`, `role`

### 1.6 Autenticación huésped (motor)

**Middleware**: `authenticateGuest` (`src/middleware/authenticateGuest.ts`).

- Header `Authorization: Bearer <jwt>` o cookie `guest_token`.
- Verificación con `GUEST_JWT_SECRET` (obligatorio; si falta: **`500`**).
- Payload en `req.guest`: `guestId`, `email`.

### 1.7 Roles (`requireRole`)

Usado en rutas de planes tarifarios. Tras `authenticateStaff`, exige que `req.user.role` sea uno de los roles permitidos; si no: **`403`**.

---

## 2. Disponibilidad y precios

Prefijo montado: **`/api/v1/availability`**.

### 2.1 Consulta pública de disponibilidad (motor / widget)

| Método | Ruta | Auth |
|--------|------|------|
| `GET` | `/api/v1/availability/` | No |

**Query** (schema `availabilityQuerySchema` en `src/validations/schemas.ts`):

| Parámetro | Tipo | Obligatorio | Notas |
|-----------|------|-------------|--------|
| `propertyId` | string | Sí | Puede ser slug u otro identificador; se resuelve vía `resolveBookingPropertyId` si `CORE_API_URL` está configurado. |
| `checkIn` | ISO date | Sí | Debe ser anterior a `checkOut`. |
| `checkOut` | ISO date | Sí | |
| `adults` | entero ≥ 1 | No | Por defecto `1`. |
| `children` | entero ≥ 0 | No | Por defecto `0`. |
| `promoCode` | string ≤ 40 | No | También se lee en el controlador desde `req.query.promoCode` (trim); alimenta elegibilidad de promos tipo `code`. |

**Header opcional**

- `Authorization: Bearer <staff token>`: se pasa a `getCategoriesWithLocalFallback` para intentar categorías autenticadas contra rooms-app; si no hay token, se usan rutas públicas de rooms.

**Respuesta `200`**

Array de objetos `AvailabilityResult` (`src/services/availabilityService.ts`), por categoría con capacidad suficiente y unidades libres &gt; 0. Campos relevantes:

| Campo | Descripción |
|-------|-------------|
| `categoryId`, `name`, `description`, `photos`, `capacity`, `amenities` | Metadatos desde rooms (o fallback local). |
| `availableUnits` | Mínimo de `availableUnits` en el rango `[checkIn, checkOut)` sobre documentos `Availability`, o `unitCount` si no hay filas. |
| `pricePerNight`, `totalAmount`, `currency`, `nights` | Mejor opción tarifaria (tras aplicar promo según motor de precios). |
| `basePricePerNight`, `appliedPromo` | Base y promo aplicada si la hubo. |
| `ratePlanOptions` | Lista de planes elegibles con precio ya promocionado, ordenados por `totalAmount` ascendente. |

Si no hay categorías: **`200`** con `[]`.

---

### 2.2 Calendario de disponibilidad (staff)

| Método | Ruta | Auth |
|--------|------|------|
| `GET` | `/api/v1/availability/calendar` | `authenticateStaff` |

**Query** (validación manual en controlador):

- `propertyId` (string, requerido)
- `from`, `to` (ISO date, requeridos; `from` ≤ `to`)

**Respuesta `200`**

Array de `CalendarRow`: por categoría, `totalUnits` y `days[]` con `{ date: "YYYY-MM-DD", availableUnits }`. Si no hay documento `Availability` para un día, se asume `totalUnits` libres.

**Errores `400`**: parámetros faltantes, fechas inválidas, o `from` posterior a `to`.

> **Nota**: El controlador no envía token a rooms; usa solo datos locales y/o públicos según `getCalendarAvailability`.

---

### 2.3 Inicializar disponibilidad (staff)

| Método | Ruta | Auth |
|--------|------|------|
| `POST` | `/api/v1/availability/initialize` | `authenticateStaff` |

**Body** (`availabilityInitSchema`):

```json
{
  "propertyId": "string",
  "categoryId": "string",
  "totalUnits": 1,
  "fromDate": "ISO",
  "toDate": "ISO"
}
```

Crea documentos `Availability` por día en el rango inclusivo si no existen (`availableUnits = totalUnits`, reservas 0).

**Respuesta `200`**: `{ "message": "Availability initialized" }`

---

### 2.4 Sincronizar disponibilidad desde categorías (staff)

| Método | Ruta | Auth |
|--------|------|------|
| `POST` | `/api/v1/availability/sync/:propertyId` | `authenticateStaff` |

- `propertyId` en path se normaliza con `resolveBookingPropertyId`.
- **Query**: `days` (número, opcional; por defecto `90`) — ventana desde hoy 00:00 local del servidor.

Flujo: obtiene categorías con `getCategoriesWithLocalFallback(propertyId, token)`; para cada categoría con `unitCount > 0`, llama a `initializeAvailability` en el rango.

**Respuesta `200`**

```json
{
  "message": "Availability synced for N categories",
  "synced": 0,
  "daysAhead": 90
}
```

Si no hay categorías: `{ "message": "No categories found", "synced": 0 }`.

---

## 3. Categorías (proxy resiliente)

Prefijo: **`/api/v1/categories`**.

| Método | Ruta | Auth |
|--------|------|------|
| `GET` | `/api/v1/categories/` | `authenticateStaff` |

**Query**: `propertyId` (requerido).

**Comportamiento**: `getCategoriesWithLocalFallback(propertyId)` **sin** token explícito en el controlador (comentario en código: JWT de staff no es válido contra rooms). Orden de fallback:

1. HTTP a `ROOMS_API_URL` (rutas públicas de categorías).
2. Categorías derivadas de `RatePlan` activos en esta API.
3. `distinct categoryId` en `Availability`.

**Respuesta `200`**: array de `CoreCategory` (`src/services/coreClient.ts`).

**Error `400`**: falta `propertyId`.

---

## 4. Promociones

Prefijo: **`/api/v1/promos`**. Todas las rutas usan **`authenticateStaff`**.

**Query `propertyId` en listado**: se resuelve con `resolveBookingPropertyId` antes de consultar Mongo.

### 4.1 Listar

| Método | Ruta |
|--------|------|
| `GET` | `/api/v1/promos/?propertyId=<id>` |

**Respuesta `200`**: array de promos con campo calculado `status`: `active` | `scheduled` | `expired` | `inactive` (`derivePromoStatus`).

### 4.2 Obtener una

| Método | Ruta |
|--------|------|
| `GET` | `/api/v1/promos/:promoId` |

**404** si no existe.

### 4.3 Crear

| Método | Ruta |
|--------|------|
| `POST` | `/api/v1/promos/` |

**Body**: ver `promoCreateSchema` (`src/validations/promoSchemas.ts`): `propertyId`, `name`, `type` (`auto`|`code`), `code` obligatorio si `type === "code"`, `discountType`, `discountValue`, categorías, fechas, `studio`, etc.

**201** cuerpo: documento creado.

**409** si código duplicado en la misma propiedad (`promoService.create`).

### 4.4 Actualizar

| Método | Ruta |
|--------|------|
| `PATCH` | `/api/v1/promos/:promoId` |

Body: `promoUpdateSchema` (al menos un campo).

**409** por código duplicado.

### 4.5 Toggle habilitado

| Método | Ruta |
|--------|------|
| `PATCH` | `/api/v1/promos/:promoId/toggle` |

**Body**: `{ "isEnabled": true|false }`

### 4.6 Eliminar

| Método | Ruta |
|--------|------|
| `DELETE` | `/api/v1/promos/:promoId` |

**204** si se borró; **404** si no existía.

---

## 5. Planes tarifarios (rate plans)

Prefijo: **`/api/v1/rate-plans`**.

El router aplica **`authenticateStaff`** a todas las rutas.

### 5.1 Crear

| Método | Ruta | Rol |
|--------|------|-----|
| `POST` | `/api/v1/rate-plans/` | `owner` o `admin` (`requireRole`) |

**Body** (`ratePlanCreateSchema`): `propertyId`, `categoryId`, `name`, `startDate`, `endDate`, `pricePerNight`, `currency` (enum `ARS`|`USD`|`EUR`|`BRL`, default `USD`), `minNights` opcional, `isActive` opcional (el servicio fuerza `isActive: true` al crear).

**201**: documento.

### 5.2 Listar

| Método | Ruta |
|--------|------|
| `GET` | `/api/v1/rate-plans/?propertyId=<id>&categoryId=<opcional>` |

**400** si falta `propertyId`.

Solo planes con `isActive: true`.

### 5.3 Obtener

| Método | Ruta |
|--------|------|
| `GET` | `/api/v1/rate-plans/:ratePlanId` |

**404** si no existe.

### 5.4 Actualizar

| Método | Ruta | Rol |
|--------|------|-----|
| `PATCH` | `/api/v1/rate-plans/:ratePlanId` | `owner` o `admin` |

**Body** (`ratePlanUpdateSchema`): al menos un campo entre categoría, nombre, fechas, precio, moneda, `minNights`.

### 5.5 Eliminar (soft delete)

| Método | Ruta | Rol |
|--------|------|-----|
| `DELETE` | `/api/v1/rate-plans/:ratePlanId` | `owner` o `admin` |

Pone `isActive: false`. **204** sin cuerpo.

---

## 6. Reservas

Montaje en **`/api/v1`** (`reservationRouter`).

### 6.1 Flujo motor (huésped autenticado)

Todas requieren **`authenticateGuest`**.

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/motor/reservations` | Lista reservas del `guestId` del token, orden `checkIn` descendente. |
| `POST` | `/api/v1/motor/reservations` | Crea reserva: estado **`pending`**, canal **`direct`**, `propertyId` resuelto con `resolveBookingPropertyId`. |
| `GET` | `/api/v1/motor/reservations/:reservationId` | Obtiene por `reservationId` **o** `reservationCode`; **403** si `guestId` no coincide. |
| `PATCH` | `/api/v1/motor/reservations/:reservationId/cancel` | Pasa a **`cancelled`** con razón fija; **403** si no es el huésped. |

**POST body** (`reservationMotorCreateSchema`):

- `propertyId`, `categoryId`, `checkIn`, `checkOut`, `adults`, `children` (default 0)
- `specialRequests`, `promoCode`, `ratePlanId` opcionales

**201**: documento `Reservation` (Mongoose). Incluye precios y referencias de promo si aplicaron.

**Errores típicos**: sin disponibilidad → excepción 500 con mensaje; fallos de persistencia revierten borrando la reserva creada en el bloque `catch` del servicio.

> **Cancelación**: usa `getByReservationId` (no acepta código en este endpoint); el parámetro debe ser el `reservationId` real.

### 6.2 Flujo staff (PMS)

Todas requieren **`authenticateStaff`**.

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/reservations` | Lista por `propertyId` y filtros opcionales. |
| `POST` | `/api/v1/reservations` | Crea reserva en estado **`confirmed`**. |
| `GET` | `/api/v1/reservations/:reservationId` | Detalle con huésped enriquecido desde colección `guests`. |
| `PATCH` | `/api/v1/reservations/:reservationId/status` | Cambio de estado con máquina de transiciones. |
| `PATCH` | `/api/v1/reservations/:reservationId/notes` | Notas internas. |

**GET list query** (`reservationListQuerySchema`):

- `propertyId` (requerido)
- `status` opcional: `pending` | `confirmed` | `checked-in` | `checked-out` | `cancelled` | `no-show`
- `checkIn`, `checkOut` opcional (filtro por ventana de día UTC)
- `guestId`, `channel` opcional

**POST body** (`reservationCreateSchema`): como el motor más `guestId` obligatorio y `channel` opcional (`direct`|`phone`|`ota`).

**PATCH status** (`updateStatusSchema`):

```json
{
  "status": "confirmed",
  "reason": "opcional, ej. cancelación"
}
```

- Si nuevo estado es **`checked-in`**: asigna unidad vía `rooms-app` (`getAvailableUnits`, `updateUnitStatus`) usando token Bearer o `app_token` (`getStaffToken` en el controlador).
- Si **`cancelled`**: libera inventario (`incrementAvailability`), setea `cancelledAt` y `cancelledReason`.

Transiciones permitidas (`VALID_RESERVATION_TRANSITIONS` en `src/constants/reservationConstants.ts`):

- `pending` → `confirmed`, `cancelled`
- `confirmed` → `checked-in`, `cancelled`, `no-show`
- `checked-in` → `checked-out`
- Estados finales: sin transiciones salientes.

**PATCH notes** (`updateNotesSchema`): `{ "internalNotes": "..." }` (máx. 1000).

**404** en notas o GET si no hay reserva.

---

## 7. Resolución de `propertyId` y datos relacionados

- **`resolveBookingPropertyId`** (`src/services/propertyResolveService.ts`): si el valor no parece UUID ni prefijo `prop-`, consulta `CORE_API_URL`:
  - `GET /api/v1/public/properties/by-slug/:id`
  - `GET /api/v1/public/properties/by-id/:id`
- Las respuestas de listados de reservas enriquecen huéspedes leyendo la colección Mongo **`guests`** (modelo read-only en `src/models/Guest.ts`), compartida con guests-app.

---

## 8. Variables de entorno relevantes para clientes / integración

| Variable | Uso en API |
|----------|------------|
| `PORT` | Puerto HTTP |
| `MONGODB_URI` / `DATABASE_MDB` | Cadena MongoDB |
| `STAFF_JWT_SECRET` / `JWT_SECRET` | Verificación JWT staff |
| `CORE_API_URL` | Perfil staff alternativo; resolución slug → `propertyId` |
| `ROOMS_API_URL` | Categorías, unidades, estados de unidad |
| `GUEST_JWT_SECRET` | JWT huésped |

---

*Documento alineado con el código en `booking-app/api/src`.*
