# Salud Financiera

Web app de finanzas personales hecha con **Angular 20** (standalone components, Signals y change detection **zoneless**). Funciona sin backend: todos los datos viven en el `localStorage` del navegador.

## Comandos

```bash
npm install
npm start            # http://localhost:4200
npm run build        # build de producción en dist/
npm test             # pruebas unitarias (Karma + Jasmine)
```

Para ejecutar las pruebas una sola vez sin abrir el navegador: `npx ng test --watch=false --browsers=ChromeHeadless`.

## Funcionalidad

| Sección | Qué incluye |
|---|---|
| **Acceso** | Configuración inicial (nombre + pregunta secreta), login, logout y "¿Olvidaste tu respuesta?" (restablece la app). |
| **Movimientos** | Resumen del mes, recomendación destacada, listado (más recientes primero) con filtros por tipo, categoría, rango de fechas y búsqueda por descripción. Ver detalle, editar y eliminar (con confirmación y opción **Deshacer**). |
| **Registrar** | Ingreso/egreso con monto, categoría, fecha y descripción opcional. Categorías personalizadas (máx. 20 caracteres), validación y confirmación visual. "Guardar y agregar otro" para capturas en serie. |
| **Análisis** | Selector de período (este mes, último mes, 3 y 6 meses, este año, personalizado). Totales, saldo neto y % de ahorro; recomendaciones automáticas; dona de egresos por categoría; barras ingresos vs egresos y línea de saldo neto (últimos 6 meses); tablas por categoría con top 3. |
| **Ajustes** | Editar perfil/pregunta/respuesta, administrar categorías personalizadas, exportar CSV, respaldo y restauración JSON, datos de ejemplo, borrar movimientos o restablecer todo. |

## Decisiones de diseño

- **La respuesta secreta no se guarda en texto plano**: se almacena un hash SHA-256 con *salt*. La comparación ignora mayúsculas, acentos y espacios extra ("Película" = "pelicula").
- **La sesión vive en `sessionStorage`**: se mantiene al recargar mientras la pestaña esté abierta y se pierde al cerrarla ("misma sesión del navegador"). Los datos sí persisten en `localStorage`.
- **Integridad de datos**: al cargar (y al importar un respaldo) cada registro se valida y repara; los inválidos o duplicados se descartan. Si el JSON está dañado, se guarda una copia en `salud-financiera.corrupt-backup` y la app arranca vacía.
- **Retención**: los movimientos con más de 2 años se eliminan automáticamente al abrir la app.
- **Gráficas en SVG propio** (sin librerías): con tooltip al pasar el cursor, leyenda y paleta categórica validada para daltonismo. Las categorías se colorean según su ranking histórico (el color no cambia al cambiar el período); a partir de la 8ª se agrupan en "Otras". Los egresos llevan textura rayada para no depender solo del color verde/rojo.
- **Proyección a 12 meses**: promedio mensual del saldo neto del período (solo meses ya transcurridos) × 12.

## Estructura

```
src/app/
├── core/
│   ├── guards/        authGuard, loginGuard, setupGuard
│   ├── layout/        Shell (header + navegación + contenido)
│   └── services/      Storage, Auth, Finance, Toast, Confirm, UiState
├── shared/
│   ├── components/    Header, Sidebar, Card, StatTile, Icon, ToastContainer, ConfirmDialog
│   ├── directives/    appAutofocus
│   ├── models/        Tipos y categorías predefinidas
│   ├── pipes/         currencyFormat, dateFormat
│   ├── utils/         Cálculos de análisis, períodos, fechas, integridad, CSV, SHA-256
│   └── validators/    Validadores de formularios
└── features/
    ├── auth/          login, setup
    ├── dashboard/     movements-list, movement-form, movement-detail
    ├── analytics/     charts, insights, category-breakdown
    └── settings/
```

## Estructura en localStorage (`salud-financiera.data`)

```json
{
  "version": 1,
  "user": { "name": "…", "secretQuestion": "…", "secretAnswer": "<sha256>", "salt": "…" },
  "movements": [
    { "id": "uuid", "type": "ingreso | egreso", "category": "…", "amount": 0, "date": "YYYY-MM-DD", "description": "…", "createdAt": "ISO" }
  ],
  "categories": { "ingreso": [], "egreso": [] }
}
```
