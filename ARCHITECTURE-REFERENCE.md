# Arquitectura Base - Elippser API

Este documento describe la arquitectura tecnológica y la estructura (scaffolding) del backend de la API, basada en Node.js, Express y TypeScript.
     
---

## 1. Stack Tecnológico

| Categoría | Tecnología | Descripción |
|-----------|------------|-------------|
| **Runtime** | Node.js | Entorno de ejecución JavaScript |
| **Lenguaje** | TypeScript | Tipado estático, compilado a JavaScript (target ES2020) |
| **Framework HTTP** | Express 4.x | Servidor web y enrutamiento |
| **Base de datos** | MongoDB | NoSQL con Mongoose como ODM |
| **Autenticación** | JWT (jsonwebtoken) | Tokens para sesiones y API |
| **Contraseñas** | bcrypt | Hash seguro de contraseñas |
| **Validación** | Joi | Schemas de validación de entrada |
| **Logging** | Winston | Logs estructurados (combined.log, error.log) |
| **WebSockets** | Socket.io | Comunicación en tiempo real (chat, notificaciones) |
| **Cloud** | Cloudinary | Almacenamiento y procesamiento de imágenes |
| **Email** | Nodemailer | Envío de correos (reset de contraseña, etc.) |
| **Testing** | Jest + Supertest | Tests unitarios e integración |
| **Traducción** | Google Translate API, DeepL | APIs de traducción |
| **Desarrollo** | ts-node-dev | Hot-reload en desarrollo |

---

## 2. Estructura del Proyecto (Scaffolding)

```
elippser-api/
├── src/
│   ├── config/           # Configuración
│   │   └── dbCon.ts      # Conexión a MongoDB
│   │
│   ├── constants/        # Constantes de la app
│   │   └── appCatalog.ts
│   │
│   ├── controllers/      # Controladores (lógica de request/response)
│   │   ├── userController.ts
│   │   ├── companyController.ts
│   │   ├── sitesController.ts
│   │   ├── propertyController.ts
│   │   ├── propertyTemplateController.ts
│   │   ├── unitController.ts
│   │   ├── assetLibraryController.ts
│   │   ├── operativeSpaceController.ts
│   │   ├── dashboardController.ts
│   │   ├── resetPasswordController.ts
│   │   └── chat/
│   │       └── chatController.ts
│   │
│   ├── helpers/          # Utilidades auxiliares
│   │   └── formatAge.ts
│   │
│   ├── middleware/       # Middleware Express
│   │   ├── autenticateJWT.ts      # Verificación JWT
│   │   ├── requireRole.ts         # Control de roles
│   │   └── requireCompanyMembership.ts
│   │
│   ├── models/           # Modelos Mongoose (entidades)
│   │   ├── User.ts
│   │   ├── Company.ts
│   │   ├── Site.ts
│   │   ├── Property.ts
│   │   ├── PropertyTemplate.ts
│   │   ├── Unit.ts
│   │   ├── OperativeSpace.ts
│   │   ├── AssetLibrary.ts
│   │   ├── Dashboard.ts
│   │   ├── Message.ts
│   │   ├── Conversation.ts
│   │   ├── ConversationMember.ts
│   │   └── PasswordResetCode.ts
│   │
│   ├── routes/           # Rutas y enrutadores
│   │   ├── index.ts      # Agregador de rutas
│   │   └── Routers/
│   │       ├── usersRouter.ts
│   │       ├── companiesRouter.ts
│   │       ├── sitesRouter.ts
│   │       ├── resetPasswordRouter.ts
│   │       ├── chatRouter.ts
│   │       ├── assetLibraryRouter.ts
│   │       ├── propertyTemplateRouter.ts
│   │       ├── propertyRouter.ts
│   │       ├── unitRouter.ts
│   │       ├── operativeSpaceRouter.ts
│   │       └── dashboardRouter.ts
│   │
│   ├── services/         # Lógica de negocio
│   │   ├── userService.ts
│   │   ├── companyService.ts
│   │   ├── siteService.ts
│   │   ├── propertyService.ts
│   │   ├── propertyTemplateService.ts
│   │   ├── unitService.ts
│   │   ├── operativeSpaceService.ts
│   │   ├── assetLibraryService.ts
│   │   ├── dashboardService.ts
│   │   ├── resetPaswordService.ts
│   │   └── chat/
│   │       ├── conversationService.ts
│   │       └── messageService.ts
│   │
│   ├── types/            # Tipos e interfaces TypeScript
│   │   ├── express.d.ts  # Extensión de Express.Request (req.user)
│   │   ├── company/
│   │   │   └── companyTypes.ts
│   │   ├── site/
│   │   │   └── siteTypes.ts
│   │   ├── chat/
│   │   │   └── chatTypes.ts
│   │   └── hospitality/
│   │       └── hospitalityTypes.ts
│   │
│   ├── utils/            # Utilidades
│   │   ├── logs/
│   │   │   └── logger.ts
│   │   ├── catch/
│   │   │   └── catchAsync.ts
│   │   └── cloudinaryHelper.ts
│   │
│   ├── validations/      # Schemas Joi
│   │   ├── validationSchemas.ts
│   │   └── chatSchemas.ts
│   │
│   ├── ws/               # WebSockets (Socket.io)
│   │   ├── socket.ts
│   │   └── chatEmitter.ts
│   │
│   ├── index.ts          # Punto de entrada (inicia DB + server + socket)
│   └── server.ts         # Configuración Express (middlewares, CORS, rutas)
│
├── dist/                 # Salida compilada (JavaScript)
├── logs/                 # Logs de aplicación
├── __tests__/            # Tests (setup, controllers, services)
├── package.json
├── tsconfig.json
└── .env                  # Variables de entorno (no en repo)
```

---

## 3. Patrones y Flujo de Datos

### 3.1 Capas

```
Request → Router → Middleware → Controller → Service → Model (DB) → Service → Controller → Response
```

| Capa | Responsabilidad |
|------|-----------------|
| **Router** | Define rutas y verbos HTTP; compone middleware (auth, roles) y controladores |
| **Middleware** | Autenticación JWT, verificación de rol, membresía de compañía |
| **Controller** | Recibe `req`/`res`, valida entrada (Joi), llama servicios, formatea respuesta |
| **Service** | Lógica de negocio pura, acceso a modelos, transacciones |
| **Model** | Esquema Mongoose, índices, hooks (pre/post save) |

### 3.2 Modelo (Mongoose)

- **Interfaces TypeScript** para documentar la entidad.
- **Schema** con tipos, validaciones, enums, índices.
- **Métodos de instancia** (ej. `comparePassword`).
- **Hooks** (`pre("save")`) para lógica antes de persistir.

### 3.3 Controlador

- Función async `(req, res)`.
- Validación con Joi: `schema.validate(req.body)`.
- Llamada a servicio; manejo de errores con `try/catch` o `catchAsync`.
- Respuestas HTTP tipadas (`res.status().json()`).

### 3.4 Servicio

- Funciones puras exportadas (o objeto con métodos).
- Reciben IDs, DTOs, opciones.
- Acceden a modelos y otros servicios.
- Lanzan errores para que el controlador los maneje.

### 3.5 Router

- `Router()` de Express.
- Rutas con `get`, `post`, `put`, `patch`, `delete`.
- Encadenamiento de middleware: `authenticateJWT`, `requireRole`, `requireCompanyMembership`.
- Sub-routers anidados (ej. `propertyRouter` → `unitRouter`, `operativeSpaceRouter`).

---

## 4. Autenticación y Autorización

- **JWT** en header `Authorization: Bearer <token>`.
- **Middleware `authenticateJWT`**: verifica token, refresca usuario desde DB y expone `req.user`.
- **`requireRole(...roles)`**: comprueba `req.user.role`.
- **`requireCompanyMembership`**: verifica que el usuario pertenezca a la compañía activa.

---

## 5. Rutas Principales

| Prefijo | Router | Descripción |
|---------|--------|-------------|
| `/site-data` | sitesRouter | Sitios (legacy) |
| `/company` | companiesRouter | Empresas |
| `/user` | usersRouter | Usuarios, login, registro |
| `/reset-password` | resetPasswordRouter | Reset de contraseña |
| `/chat` | chatRouter | Chat y conversaciones |
| `/asset-library` | assetLibraryRouter | Biblioteca de assets |
| `/api/v1/property-templates` | propertyTemplateRouter | Plantillas de propiedades |
| `/api/v1/properties` | propertyRouter | Propiedades (con units, spaces anidados) |

---

## 6. WebSockets (Socket.io)

- Inicializado en `index.ts` sobre el mismo `http.Server` que Express.
- Autenticación por token en handshake.
- Salas por usuario (`userId`) y por conversación (`conversationId`).
- Eventos: `conversation:join`, `conversation:leave`, mensajes, etc.

---

## 7. Configuración y Variables de Entorno

| Variable | Uso |
|----------|-----|
| `DATABASE_MDB` | URI de conexión MongoDB |
| `JWT_SECRET` | Firma de tokens JWT |
| Otras | Cloudinary, email, APIs de traducción, etc. |

---

## 8. Testing

- **Jest** para tests.
- **Supertest** para requests HTTP.
- Tests en `src/__tests__/` (controllers, services, middleware).
- Setup compartido en `src/__tests__/setup.ts`.

---

## 9. Scripts NPM

| Script | Comando | Descripción |
|--------|---------|-------------|
| `dev` | `ts-node-dev --respawn --transpile-only src/index.ts` | Desarrollo con hot-reload |
| `build` | `tsc` | Compila TypeScript → `dist/` |
| `start` | `node dist/index.js` | Producción |
| `test` | `jest` | Ejecuta tests |
| `test:watch` | `jest --watch` | Tests en modo watch |
| `test:coverage` | `jest --coverage` | Cobertura de tests |

---

## 10. Plantilla para Nuevo Dominio

Al agregar un nuevo recurso (ej. `Invoice`):

1. **Model**: `src/models/Invoice.ts` (Schema + interface).
2. **Types**: `src/types/invoice/invoiceTypes.ts` (si es necesario).
3. **Service**: `src/services/invoiceService.ts` (lógica de negocio).
4. **Controller**: `src/controllers/invoiceController.ts` (handlers HTTP).
5. **Router**: `src/routes/Routers/invoiceRouter.ts` (rutas + middleware).
6. **Validations**: schemas en `validationSchemas.ts` o archivo específico.
7. **Registro**: añadir `router.use("/api/v1/invoices", invoiceRouter)` en `src/routes/index.ts`.

---

*Documento generado a partir del análisis del backend Elippser API.*
