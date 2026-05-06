# Arquitectura — `booking-app/api` (`elippser-pms-booking-api`)

Este servicio es el **backend de reservas y disponibilidad** del ecosistema: expone el motor de booking (huésped), operaciones de staff alineadas al PMS, y persiste inventario diario, planes tarifarios y promociones en MongoDB. Integra **pms-core** (identidad de staff y resolución de propiedad) y **rooms-app** (categorías y unidades físicas).

---

## 1. Stack y artefactos

| Capa | Tecnología |
|------|------------|
| Runtime | Node.js |
| Lenguaje | TypeScript (target **ES2020**, `module: commonjs`, salida `dist/`) |
| HTTP | Express 4 |
| Persistencia | MongoDB vía **Mongoose 8** |
| Validación | **Joi** |
| Auth | **jsonwebtoken**; validación staff opcional remota con **axios** contra core |
| Utilidades | **dotenv**, **cors**, **cookie-parser** |

**Scripts** (`package.json`):

- `dev`: `ts-node-dev --respawn --transpile-only src/index.ts`
- `build`: `tsc`
- `start`: `node dist/index.js`
- `test` / `test:watch` / `test:coverage`: Jest

---

## 2. Punto de entrada y ciclo de vida HTTP

### 2.1 `src/index.ts`

- Carga variables con `dotenv/config`.
- Crea `http.Server` a partir de la app Express exportada por `server.ts`.
- **`connectDB()`** antes de `listen` para fallar rápido si Mongo no está disponible.
- Puerto: `process.env.PORT || 7070`.

### 2.2 `src/server.ts`

Orden de middlewares y rutas:

1. `cors({ origin: true, credentials: true })`
2. `express.json()`
3. `cookieParser()`
4. **`GET /health`** — respuesta mínima sin lógica de negocio.
5. **Middleware async global**: en cada request, `await connectDB()` y `next()`. La función `connectDB` (`src/config/dbCon.ts`) es **idempotente**: si `mongoose` ya está conectado (`readyState === 1`), no hace nada; si no, reutiliza una única `connectPromise` hasta completar o fallar.
6. `app.use(routes)` — árbol bajo `src/routes/index.ts`.
7. **`errorHandler`** — último middleware; loguea y responde JSON `{ error }`.

### 2.3 Enrutado agregado

`src/routes/index.ts` monta:

| Prefijo | Módulo |
|---------|--------|
| `/api/v1/availability` | `availabilityRouter` |
| `/api/v1/categories` | `categoryRouter` |
| `/api/v1/promos` | `promoRouter` |
| `/api/v1/rate-plans` | `ratePlanRouter` |
| `/api/v1` | `reservationRouter` (incluye `/reservations` y `/motor/reservations`) |

---

## 3. Estructura de carpetas (`src/`)

```
src/
├── index.ts                 # Servidor HTTP + listen
├── server.ts                # App Express, CORS, DB middleware, rutas
├── config/
│   └── dbCon.ts             # Conexión Mongo singleton / promise
├── routes/
│   ├── index.ts
│   ├── availabilityRouter.ts
│   ├── categoryRouter.ts
│   ├── promoRouter.ts
│   ├── ratePlanRouter.ts
│   └── reservationRouter.ts
├── controllers/             # Validación Joi + mapeo req/res
├── middleware/
│   ├── authenticateStaff.ts
│   ├── authenticateGuest.ts
│   ├── requireRole.ts
│   └── errorHandler.ts
├── services/                # Lógica de negocio y orquestación
├── models/                  # Esquemas Mongoose
├── validations/             # Schemas Joi
├── constants/
│   └── reservationConstants.ts  # Estados y transiciones
├── types/
│   └── express.d.ts         # req.user, req.guest
└── utils/
    ├── catch/catchAsync.ts
    ├── generateReservationCode.ts
    └── logs/logger.ts
```

---

## 4. Patrón de capas

```
HTTP → Router → (Middleware auth) → Controller → Service → Model / HTTP saliente (core, rooms)
```

- **Controllers**: validan entrada, extraen identidad (`req.user` / `req.guest`), llaman servicios, fijan códigos HTTP explícitos solo en casos conocidos (400, 401, 403, 404, 409, 204).
- **Services**: reglas de negocio, transacciones lógicas (crear reserva + decrementar disponibilidad), integración con otras APIs.
- **Models**: persistencia y restricciones de esquema; índices compuestos en `Availability` y `Reservation` para consultas por propiedad/fecha/estado.

**Errores async**: `catchAsync` envuelve handlers y delega en `next(err)` → `errorHandler`.

---

## 5. Autenticación y autorización

### 5.1 Staff (`authenticateStaff`)

1. Token desde `Authorization: Bearer` o cookie `app_token`.
2. Intento **local** con `STAFF_JWT_SECRET || JWT_SECRET` (mismo secreto que usa pms-core para firmar login, según comentario en código).
3. Si no hay payload válido, **fallback HTTP** a `GET {CORE_API_URL}/user/profile` con el Bearer; espera `userId`, `activeCompany` o `companyId`, `role`.
4. Sin secreto ni `CORE_API_URL`: error de configuración **500**.

Esto permite entornos donde el JWT del core no se verifica localmente (secret distinto) pero el token sigue siendo válido contra el core.

### 5.2 Huésped (`authenticateGuest`)

- Solo verificación local con `GUEST_JWT_SECRET`.
- Cookies `guest_token` soportadas para el mismo token.

### 5.3 Roles

`requireRole("owner", "admin")` tras staff auth en mutaciones sensibles de rate plans.

---

## 6. Integraciones externas

### 6.1 pms-core (`CORE_API_URL`)

| Uso | Implementación |
|-----|----------------|
| Validar staff | `GET /user/profile` |
| Resolver propiedad | `GET /api/v1/public/properties/by-slug/:slug`, `.../by-id/:id` |
| (Cliente disponible) | `verifyProperty` en `coreClient.ts` — no referenciado por los routers actuales, útil para extensiones |

### 6.2 rooms-app (`ROOMS_API_URL`)

| Uso | Implementación |
|-----|----------------|
| Listar categorías | `GET .../api/v1/properties/:id/categories` o, sin token, también `.../public/properties/:id/categories` |
| Unidades disponibles | `GET .../units?categoryId&status=available` (con Bearer staff) |
| Ocupar unidad | `PATCH .../units/:unitId/status` con `{ status: "occupied" }` |

**Importante**: el JWT de **booking-api** no es el mismo que el de **rooms-app** en muchos despliegues; por eso el listado de categorías para staff en `categoryController` **no** reenvía el token, y el calendario documenta explícitamente el uso sin token a rooms.

### 6.3 Colección `guests` (Mongo compartida)

`Guest` en `src/models/Guest.ts` apunta a la colección `guests` con `strict: false` para tolerar campos adicionales administrados por **guests-app**. Solo lectura desde booking-api (`getGuestSummariesMap`).

---

## 7. Dominio de datos (modelos)

### 7.1 `Reservation`

- Identificadores: `reservationId` (prefijo `res-` + UUID), `reservationCode` único legible (`RES-YYYY-XXXX`).
- Estados y canal acotados por enum en schema; transiciones en `VALID_RESERVATION_TRANSITIONS`.
- Campos de auditoría de precio: `priceBeforePromo`, `totalBeforePromo`, `appliedPromo*`, `ratePlanId`.
- Índices: `propertyId`, `guestId`, compuestos para listados operativos.

### 7.2 `Availability`

- Una fila por `(propertyId, categoryId, date)` única.
- `totalUnits`, `reservedUnits`, `blockedUnits`, `availableUnits` — inventario **por noche** (día civil; en decremento/incremento el bucle usa medianoche local del servidor en algunos caminos; las reservas se documentan en código como UTC midnight para filtros de listado).

### 7.3 `RatePlan`

- Ventana `[startDate, endDate]` que debe **cubrir todo el rango de estadía** `[checkIn, checkOut)` para cotizar.
- `minNights` opcional filtra elegibilidad.
- “Borrado” = `isActive: false`.

### 7.4 `Promo`

- Tipos `auto` (siempre candidata si pasa filtros) vs `code` (solo si el request incluye el código normalizado).
- Índice parcial único `(propertyId, code)` cuando `code` es string.
- `discountType`: `percentage` (valor con signo), `fixed_amount` (requiere coincidencia de `currency` con la tarifa), `price_override` (precio por noche absoluto, no negativo tras `Math.max`).

---

## 8. Lógica central

### 8.1 Disponibilidad (`availabilityService`)

1. Obtiene categorías vía `getCategoriesWithLocalFallback` (rooms → rate plans → availability distinct).
2. Filtra por capacidad `adults` / `children` si vienen informados.
3. Para cada categoría con `unitCount > 0`, lee documentos `Availability` en `[checkIn, checkOut)`; el mínimo de `availableUnits` en ese rango define ocupación; si no hay filas, asume todas las unidades libres.
4. Cotiza: `ratePlanService.listPricesForRange` o fallback a precio base de categoría; construye `ratePlanOptions` aplicando `computePricing` por plan.
5. Expone la mejor opción (menor total) como precio principal del resultado.

**Decremento / incremento**: recorre cada noche entre check-in y check-out; crea documento del día si no existe (con `totalUnits` provisto desde rooms o último availability); ajusta `reservedUnits` y recalcula `availableUnits`.

### 8.2 Motor de precios (`pricingService.computePricing`)

- Filtra candidatas por categoría (`appliesToAllCategories` / `categoryIds`) y restricciones (`minNights`, `minAdvanceDays`, ventana UTC de `startDate`/`endDate` vs día de `checkIn`).
- Evalúa cada promo restante; ordena por menor `finalPerNight` (**best deal wins**).
- Comportamiento documentado en código: si la “mejor” promo **empeora** el precio respecto a la base (`finalPerNight >= basePerNight`), **igual puede aplicarse** (caso surcharge/temporada); la alternativa “siempre preferir base” está comentada en el fuente.

### 8.3 Promos elegibles (`promoService.findEligible`)

- `isEnabled: true`, ventana de fin de vigencia comparada contra **inicio del día UTC actual** (evita cortar promos el último día por hora del día).
- `$or`: tipo `auto` **o** `code` coincidente con el código normalizado de la query.

### 8.4 Creación de reservas (`reservationService`)

- **Motor** (`createReservationFromMotor`): resuelve `propertyId`, comprueba disponibilidad, precia con `priceReservation` (promos + rate plan opcional), crea con estado `pending`, canal `direct`, decrementa disponibilidad; rollback borrando la reserva si falla el decremento.
- **PMS** (`createReservationFromPMS`): mismo flujo pero estado `confirmed`, canal del payload, `createdByUserId`.
- **Precio**: si `ratePlanId` apunta a un plan válido para el rango, usa `getQuoteByRatePlanId`; si no, cae a `getPriceForRange`. El identificador sintético `__base__` (`RATE_PLAN_BASE_FALLBACK_ID`) representa tarifa estándar desde categoría.

### 8.5 Cambio de estado

- Validación de grafo de transiciones.
- **`checked-in`**: primera unidad `available` en rooms → `occupied`, guarda `assignedUnitId`.
- **`cancelled`**: `incrementAvailability` y metadatos de cancelación.

### 8.6 Resiliencia de categorías (`categoryResilience`)

Evita que caída o mismatch de rooms deje al motor sin categorías: segunda fuente rate plans locales, tercera `Availability.distinct`.

---

## 9. Logging

`src/utils/logs/logger.ts` **no escribe archivos** (comentario: restricciones tipo Vercel). Emite a `console` con niveles `log` / `warn` / `error`. El `errorHandler` usa `logger.error` con stack.

---

## 10. Configuración MongoDB

`connectDB` usa en orden:

1. `process.env.MONGODB_URI`
2. `process.env.DATABASE_MDB`
3. Fallback `mongodb://localhost:27017/elippser-booking`

En reconexión, resetea `connectPromise` al evento `disconnected`.

---

## 11. Extensibilidad

Para un nuevo recurso REST coherente con el proyecto:

1. Modelo en `src/models/`.
2. Validaciones Joi en `src/validations/`.
3. Servicio en `src/services/`.
4. Controller en `src/controllers/`.
5. Router en `src/routes/`, registro en `src/routes/index.ts`.
6. Middleware de auth según superficie (pública, staff, guest).

Mantener la separación: **integración HTTP** (axios) en `coreClient` / servicios dedicados; **reglas** en servicios; **I/O HTTP** mínima en controladores.

---

*Documento derivado del análisis del código en `booking-app/api/src`.*
