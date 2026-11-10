# Salud Financiera

Web app de finanzas personales con cuentas de usuario: inicias sesión con correo y contraseña y ves tus datos en cualquier dispositivo.

| Parte | Tecnología | Dónde vive |
|---|---|---|
| Frontend | **Angular 20** (standalone, Signals, zoneless) | Netlify |
| API | **Node + Fastify + TypeScript** (carpeta `server/`) | Render |
| Base de datos | **Postgres** | Neon |

## Comandos

```bash
# Frontend
npm install
npm start            # http://localhost:4200 (usa la API en http://localhost:3000)
npm run build        # build de producción en dist/ (usa la API de Render)
npx ng test --watch=false --browsers=ChromeHeadless

# API
cd server
npm install
npm run dev          # http://localhost:3000; sin DATABASE_URL usa PGlite en server/.data
npm test             # pruebas de la API con una base en memoria
npm run build        # bundle en server/dist
```

En desarrollo no necesitas instalar Postgres: sin `DATABASE_URL` la API usa [PGlite](https://pglite.dev) (Postgres en WebAssembly) y guarda los datos en `server/.data`. Para probar contra Neon, define `DATABASE_URL` antes de `npm run dev`.

## Despliegue

### 1. Base de datos en Neon
1. Crea un proyecto en [neon.tech](https://neon.tech) (región cercana a la de Render, p. ej. *AWS US West (Oregon)*).
2. Copia la **connection string** (`postgresql://…?sslmode=require`). No hace falta crear tablas: la API aplica las migraciones al arrancar.

### 2. API en Render
1. En Render: **New → Blueprint** y elige este repositorio. `render.yaml` crea el servicio `salud-financiera-api` (carpeta `server/`, plan gratuito).
2. Captura las variables que pide:
   - `DATABASE_URL`: la connection string de Neon.
   - `CORS_ORIGIN`: la URL de Netlify, p. ej. `https://mi-app.netlify.app` (varias, separadas por coma).
3. Al terminar, abre `https://<servicio>.onrender.com/health`: debe responder `{"ok":true}`.

Si el servicio queda con otro nombre, cambia la URL en `src/environments/environment.production.ts`.

> En el plan gratuito Render duerme el servicio tras 15 minutos sin uso; la primera petición tarda hasta un minuto. La app abre al instante con la caché y muestra "El servidor está despertando" mientras tanto.

### 3. Frontend en Netlify
Sin cambios: Netlify compila con `npm run build` (configuración de producción, que apunta a Render).

## Variables de entorno de la API

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Cadena de conexión de Neon. Obligatoria en producción. |
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma. Vacío = solo `localhost` (desarrollo). |
| `PORT` | Puerto (Render lo define solo). Por defecto 3000. |
| `SESSION_DAYS` | Días que dura una sesión sin uso. Por defecto 60. |

## Funcionalidad

| Sección | Qué incluye |
|---|---|
| **Cuenta** | Registro con nombre, correo y contraseña; inicio y cierre de sesión. La sesión se mantiene en el dispositivo hasta 60 días sin uso. Si el navegador tenía datos de la versión anterior (solo locales), se ofrece subirlos a la cuenta sin duplicar. |
| **Movimientos** | Resumen del mes, recomendación destacada, listado (más recientes primero) con filtros por tipo, categoría, rango de fechas y búsqueda por descripción. Ver detalle, editar y eliminar (con confirmación y opción **Deshacer**). |
| **Registrar** | Ingreso/egreso con monto, categoría, fecha y descripción opcional. Categorías personalizadas (máx. 20 caracteres), validación y confirmación visual. "Guardar y agregar otro" para capturas en serie. |
| **Cuentas** | Forma de pago en cada movimiento (efectivo o tarjeta/transferencia), saldo inicial por cuenta a una fecha y traspasos (retiros de cajero y depósitos) que no cuentan como gasto ni ingreso. Saldo disponible total y por cuenta en la pantalla principal; en Cuentas, cómo se llegó a cada saldo. Las tarjetas de crédito no son una cuenta: tendrán su propio módulo. |
| **Metas** | Metas con precio y fecha objetivo opcional (ej. "Comprar iPhone"), barra de progreso, cuánto falta y cuánto apartar al mes para llegar. Los abonos apartan dinero de efectivo o de tarjeta/transferencia: sigue en la cuenta, pero el saldo disponible muestra cuánto está libre. Retiros, historial y, al completarla, registro opcional de la compra como egreso. |
| **Proyección** | Saldo libre al cierre de cada mes (3, 6 o 12 meses): ingresos y gasto del día a día promedio de los últimos 3 meses cerrados, pagos recurrentes en su fecha, gastos planeados (vacaciones, tenencia…) y el ahorro mensual de las metas con fecha. Del mes en curso solo cuenta lo que falta. Avisa el primer mes que quedaría en negativo. |
| **Presupuestos** | Tope mensual por categoría de egreso: gastado, disponible, nivel (en rango, ≥80 %, excedido) y marca de "lo esperado a la fecha". Proyección al cierre con tu historial (lo que sueles gastar después de este día del mes), así un pago fijo ya hecho no se proyecta de más. Sugerencia de montos con el promedio de los últimos 3 meses, gasto sin presupuesto, resumen en Movimientos y aviso al registrar un egreso. |
| **Pagos recurrentes** | Pagos fijos y suscripciones (mensuales o anuales): próximos 30 días, estado del vencimiento (pagado, pendiente, vencido), compromiso mensual, total en suscripciones y "Marcar pagado". Se reconoce el pago si la descripción de un egreso contiene el texto del pago (también con los cargos del iPhone) a ±10 días del vencimiento. Avisa cambios de precio y detecta en el historial egresos que se repiten cada mes con monto parecido (en categorías de gasto variable, solo si el monto es prácticamente igual). |
| **Análisis** | Selector de período (este mes, último mes, 3 y 6 meses, este año, personalizado). Totales, saldo neto y % de ahorro; recomendaciones automáticas; dona de egresos por categoría; barras ingresos vs egresos y línea de saldo neto (últimos 6 meses); tablas por categoría con top 3. |
| **Ajustes** | Cambiar nombre y contraseña (cierra las demás sesiones), administrar categorías personalizadas, registro rápido desde iPhone, exportar CSV, respaldo y restauración JSON, datos de ejemplo, borrar movimientos y eliminar la cuenta. |
| **Registro rápido** | Un atajo del iPhone abre `/registro-rapido#monto=…&comercio=…&tarjeta=…` y el cargo queda en una bandeja para confirmarlo con su categoría. Las categorías se recuerdan por comercio. Si no hay sesión, el cargo se guarda y se registra al iniciar sesión. |

## Registro rápido desde Atajos (iPhone)

1. En **Atajos** → **Automatización** → **Nueva automatización** → **Cartera**: elige tus tarjetas y marca **Ejecutar inmediatamente**.
2. Acción **Codificar URL** sobre el comercio de la entrada del atajo.
3. Acción **URL** con `https://<tu-sitio>.netlify.app/registro-rapido#monto=[Importe]&comercio=[Comercio codificado]&tarjeta=[Tarjeta]`.
4. Acción **Abrir URL**.

Parámetros del fragmento: `monto` (obligatorio; acepta `$1,234.50`, `1.234,50`, etc.), `comercio`, `tarjeta`, `tipo` (`egreso` por defecto o `ingreso`) y `fecha` (`AAAA-MM-DD`, hoy por defecto). Van después de `#` para que nunca lleguen al servidor. Un mismo cargo repetido en menos de 2 minutos se ignora.

Límites: la automatización de Cartera solo se dispara con pagos de **Apple Pay**. Safari y la app agregada a la pantalla de inicio tienen sesiones distintas: si el atajo abre uno donde no has entrado, la app pide iniciar sesión y registra el cargo después (hasta 30 minutos). `public/_redirects` hace que Netlify sirva `index.html` en cualquier ruta, necesario para abrir `/registro-rapido` directamente.

## Decisiones de diseño

- **El servidor tiene la última palabra; la app guarda una caché.** `StorageService` aplica cada cambio en pantalla al instante y envía al servidor solo la diferencia (`POST /api/data/changes`), en orden. Si el servidor lo rechaza o no hay conexión, regresa al último estado confirmado y lo avisa. La caché (por usuario) permite abrir la app sin esperar a Render; al volver a la pestaña tras un minuto se recarga del servidor para traer lo capturado en otros dispositivos.
- **Mismas validaciones en ambos lados**: la API importa `data-integrity.utils` y `sync.utils` del frontend (esbuild los empaqueta), así que el servidor nunca guarda un registro que la app no aceptaría.
- **Contraseñas**: hash `scrypt` con salt (módulo `crypto` de Node, sin dependencias nativas). Un login con correo inexistente tarda lo mismo que uno real, y el mensaje de error es el mismo, para no revelar qué correos existen. Máximo 10 intentos por minuto e IP.
- **Sesiones**: token aleatorio en `Authorization: Bearer`; en la base solo se guarda su SHA-256. Se usa encabezado y no cookie porque Netlify y Render son dominios distintos y Safari bloquea cookies de terceros. Expira tras 60 días sin uso; cambiar la contraseña cierra las demás sesiones.
- **Retención**: los movimientos y traspasos con más de 2 años se eliminan automáticamente al cargar los datos. Si el saldo inicial es anterior, antes se recorre a la fecha de corte con el efecto de lo borrado, así el saldo de las cuentas no cambia.
- **Gráficas en SVG propio** (sin librerías): con tooltip al pasar el cursor, leyenda y paleta categórica validada para daltonismo. Las categorías se colorean según su ranking histórico (el color no cambia al cambiar el período); a partir de la 8ª se agrupan en "Otras". Los egresos llevan textura rayada para no depender solo del color verde/rojo.
- **Proyección a 12 meses**: promedio mensual del saldo neto del período (solo meses ya transcurridos) × 12.

## Estructura

```
src/app/
├── core/
│   ├── guards/        authGuard, guestGuard
│   ├── layout/        Shell (header + navegación + contenido)
│   └── services/      Api, Auth, Storage (caché + sincronización), Finance, Inbox, Budget, Recurring…
├── shared/
│   ├── components/    Header, Sidebar, BottomNav, Card, StatTile, ToastContainer, ConfirmDialog
│   ├── models/        Tipos y categorías predefinidas
│   ├── utils/         Cálculos, períodos, fechas, integridad, sincronización, CSV
│   └── validators/    Validadores de formularios
└── features/          auth (login, registro), dashboard, budgets, recurring, analytics, quick-questions, quick-add, settings

server/
├── src/
│   ├── app.ts         Fastify: CORS, límite de intentos, autenticación, errores
│   ├── db.ts          Postgres (Neon) o PGlite, y migraciones
│   ├── security.ts    scrypt y tokens de sesión
│   └── routes/        auth, account, data
└── test/              Pruebas de la API (node:test + PGlite en memoria)
```

## API

| Método y ruta | Descripción |
|---|---|
| `POST /api/auth/register` | `{ name, email, password }` → `{ token, user }` |
| `POST /api/auth/login` | `{ email, password }` → `{ token, user }` |
| `POST /api/auth/logout` | Cierra la sesión actual |
| `GET /api/auth/me` | Usuario de la sesión |
| `PATCH /api/account` | `{ name }` |
| `POST /api/account/password` | `{ currentPassword, newPassword }` |
| `DELETE /api/account` | `{ password }`: borra la cuenta y sus datos |
| `GET /api/data` | Todos los datos del usuario (`movements`, `pending`, `recurring`, `rules`, `budgets`, `categories`, `recurringIgnored`) |
| `POST /api/data/changes` | `{ upsert: { colección: [...] }, remove: { colección: [claves] }, categories?, recurringIgnored? }` |

## Base de datos

- `users`: correo (único, en minúsculas), nombre, hash de contraseña, categorías personalizadas, pagos detectados descartados y saldo inicial (`opening`).
- `sessions`: hash del token, vencimiento y último uso.
- `movements`: columnas tipadas (`amount numeric(14,2)`, `date date`, `account` efectivo/banco), llave `(user_id, id)` e índice por fecha.
- `user_items`: bandeja, pagos recurrentes, reglas por comercio, presupuestos, traspasos, metas, abonos y gastos planeados como documentos JSON con llave `(user_id, kind, key)`.

Las migraciones están en `server/src/db.ts`: se agregan al final de la lista y cada una se aplica una sola vez al arrancar.
