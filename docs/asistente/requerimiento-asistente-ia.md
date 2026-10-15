# Asistente con IA y preguntas rápidas

Registro del requerimiento de un bot que conteste preguntas sobre la información de la app, de las
decisiones que se tomaron y de lo que quedó implementado el 15/10/2026.

> Estado: **preguntas rápidas implementadas en `main`** (sin IA). Las **herramientas del asistente** están
> listas y probadas, pero todavía no se conectan a ningún modelo. El agente con IA queda pendiente.

---

## 1. Requerimiento

Implementar un bot con IA que conteste preguntas sobre los datos de la app (ingresos, egresos,
categorías, recomendaciones). Por ejemplo: "¿en qué gasté más este mes?", "¿cómo voy contra el mes
pasado?" o "¿cuánto llevo en Uber?".

**Restricciones del proyecto que condicionan la solución:**

- No hay backend: todo vive en `localStorage` (`salud-financiera.data`) y la app se sirve desde
  Netlify.
- La autenticación (pregunta secreta) es local. No sirve para proteger un servicio en internet.
- La app se usa también desde el iPhone (registro rápido con Atajos).

---

## 2. Decisiones

### 2.1 Arquitectura del agente: herramientas en el navegador y proxy sin estado

```
Navegador (Angular)                     Netlify Function            Modelo
───────────────────                     ────────────────            ──────
AssistantService ── mensajes ────────▶  /api/chat  ───────────────▶ Claude u otro
      ▲                                 (agrega instrucciones,
      │◀───────── pide una herramienta ─ herramientas y API key)
      │
 ejecuta la herramienta sobre localStorage y devuelve el resultado
```

- El modelo **no recibe todos los movimientos**. Pide datos con herramientas y el navegador
  responde con resultados agregados.
- Las cuentas las hace el código de la app (`analytics.utils.ts`), no el modelo. Así las cifras
  coinciden con lo que muestra Análisis.
- La API key nunca va en el navegador. El proxy fija el modelo, las instrucciones y las
  herramientas; del cliente solo acepta los mensajes.

**Descartado:** enviar todos los movimientos en el prompt. Expone más datos personales, cuesta más
por pregunta y es menos confiable para sumar.

### 2.2 Costo

El uso de la API **se cobra aparte de cualquier suscripción** (Pro o Max), por tokens consumidos y
con créditos prepagados en platform.claude.com.

Estimación por pregunta, con 2 o 3 llamadas a herramientas (precios de octubre de 2026):

| Modelo | Por pregunta | ~300 preguntas al mes |
| --- | --- | --- |
| Claude Opus 5.5 ($4 / $20 por millón de tokens) | ~$0.05–0.08 USD | ~$15–25 USD |
| Claude Sonnet 5.5 ($2 / $10) | ~$0.02–0.04 USD | ~$6–12 USD |
| Claude Haiku 5.5 ($0.10 / $0.50) | ~$0.002 USD | ~$1 USD |

Para uso personal probablemente basta con Haiku, porque los cálculos los hacen las herramientas.

### 2.3 Alternativas evaluadas

| Opción | Costo | Privacidad | Calidad | Notas |
| --- | --- | --- | --- | --- |
| Claude por API (proxy en Netlify) | Por uso | Salen datos agregados | Alta | La opción más simple de operar |
| Modelo local con Ollama en una PC | $0 (luz) | Total | Media | Requiere GPU (8–16 GB de VRAM) o Mac con Apple Silicon, la PC encendida y un túnel (Tailscale) para usarla desde el iPhone |
| Modelo en el navegador (WebLLM) | $0 | Total | Media-baja | Descarga de 1–4 GB; en iPhone casi no funciona |
| Preguntas rápidas sin IA | $0 | Total | Exacta, pero limitada | No entiende lenguaje libre |

Los modelos de Claude no se pueden correr localmente; un "agente local" con Claude sigue pagando
la API.

### 2.4 Decisión: empezar sin IA

Un agente aporta **comodidad y flexibilidad, no información nueva**: casi todas las preguntas
típicas ya tienen respuesta en Movimientos y Análisis. Por eso se decidió:

1. Construir las herramientas **independientes del proveedor**, para que sirvan con Claude, con
   Ollama o sin modelo.
2. Usarlas primero en un panel de **preguntas rápidas** sin IA.
3. Agregar el agente después, solo si en el uso diario hacen falta preguntas libres.

---

## 3. Qué quedó implementado

Commit `545e695` en `main`: *Preguntas rápidas sobre tus finanzas y herramientas para un futuro
asistente*.

### 3.1 Sección Preguntas (`/preguntas`)

Nueva entrada en el menú, entre Análisis y Ajustes. En escritorio las preguntas son una lista
lateral; en teléfono, un carrusel horizontal.

| Pregunta | Parámetros | Respuesta |
| --- | --- | --- |
| ¿Cuánto gasté y cuánto me quedó? | Período | Ingresos, egresos, saldo y % de ahorro; menciona lo apartado en "Ahorros" |
| ¿En qué gasto más? | Período | Categorías de egreso con barra de proporción (máx. 8) |
| ¿Cuánto gasté en una categoría? | Categoría, período | Total, % de los egresos, promedio y movimientos recientes |
| ¿Cómo voy contra el mes anterior? | Mes | Diferencia de egresos y las categorías que más cambiaron |
| ¿Cuáles fueron mis gastos más grandes? | 5, 10 o 20; período | Los N egresos más grandes y su peso en el total |
| ¿Cuánto llevo en algo específico? | Texto, período | Total de lo que coincide en la descripción y la lista |
| ¿Cómo ha cambiado mi saldo? | 3, 6 o 12 meses | Promedios mensuales, mejor y peor mes, detalle mes a mes |

**Reglas de negocio:**

- **Comparativa del mes en curso:** compara el mismo tramo de días del mes anterior (del 1 al día
  de hoy) y lo indica en la respuesta. Si el día no existe en el mes anterior (p. ej. 31), se usa
  su último día.
- **Tendencia:** el mes en curso no entra en el promedio si hay meses cerrados con datos.
- **"Ver estos movimientos"** abre Movimientos con los mismos filtros. La búsqueda por texto mira
  solo la descripción, igual que el buscador de Movimientos, para que ambas pantallas muestren lo
  mismo.
- La categoría por defecto es la de mayor gasto histórico.

### 3.2 Herramientas del asistente

`src/app/shared/utils/assistant-tools.ts` expone siete herramientas de **solo lectura**:

| Herramienta | Para qué | Usa |
| --- | --- | --- |
| `obtener_resumen` | Totales y tasa de ahorro de un período | `summarize` |
| `desglose_por_categoria` | Categorías de un tipo, de mayor a menor | `byCategory` |
| `serie_mensual` | Ingresos, egresos y saldo por mes (máx. 24) | `monthlySeries` |
| `buscar_movimientos` | Filtros por tipo, categoría, fechas, montos y texto; 4 órdenes | `queryMovements`, `orderMovements` |
| `obtener_recomendaciones` | Las recomendaciones de Análisis | `buildInsights` |
| `listar_categorias` | Predefinidas, personalizadas y usadas | — |
| `pendientes_por_confirmar` | Bandeja del registro rápido | `data.pending` |

**Contrato:**

- `ASSISTANT_TOOLS`: definiciones con un subconjunto de JSON Schema que aceptan tanto Claude
  (incluido `strict: true`) como las APIs estilo OpenAI/Ollama. Los límites numéricos van en la
  descripción y se aplican en código.
- `runAssistantTool(nombre, input, data, hoy?)`: valida y ejecuta. **Nunca lanza**: los errores
  regresan como `{ ok: false, error }` en español para que el modelo se corrija.
- Tolerancia: rangos invertidos se intercambian; los `null` en opcionales se ignoran.
- Límites: 50 movimientos por búsqueda (20 por defecto), 24 meses por serie, 50 pendientes. Si se
  recorta, el resultado lo indica y las sumas cubren **todas** las coincidencias.
- Privacidad: solo `buscar_movimientos` y `pendientes_por_confirmar` envían descripciones o
  comercios; el resto envía totales.

### 3.3 Cambios en código existente

- `analytics.utils.ts`: nuevas `queryMovements` y `orderMovements`, compartidas por el panel y las
  herramientas.
- `format.utils.ts`: `formatDate` se movió aquí desde el pipe `dateFormat` (el pipe la usa y se
  comporta igual).
- Menú: la barra inferior del teléfono pasó de 4 a 5 columnas. Íconos nuevos registrados en
  `core/icons.ts`.

### 3.4 Verificación

- 67 pruebas unitarias en verde (`npx ng test --watch=false --browsers=ChromeHeadless`), de ellas
  18 de las herramientas y 12 de las preguntas.
- Build de producción sin errores. La sección se carga aparte (~7 KB comprimidos).
- Revisión en Chrome a 1440 px y 390 px con datos de ejemplo: sin errores de consola ni scroll
  horizontal. "Ver estos movimientos" muestra los mismos movimientos y totales que la respuesta.

---

## 4. Pendiente: agente con IA

Retomar solo si las preguntas rápidas se quedan cortas.

### 4.1 Decisiones abiertas

- **Proveedor:** Ollama local (requiere hardware) o Claude por API (Haiku 5.5 como punto de
  partida). El modelo debe quedar en una variable de entorno.
- **Autenticación del proxy:** token compartido o Netlify Identity.

### 4.2 Fases

1. ~~Herramientas y pruebas~~ (hecho).
2. **Proxy** `netlify/functions/chat.ts`: API key en variables de entorno; el servidor fija el
   modelo, las instrucciones y las herramientas. Prompt caching sobre las herramientas y la parte
   fija del system prompt; la fecha de hoy va aparte. Respuesta en streaming. Probar con
   `netlify dev`.
3. **`AssistantService` e interfaz:** ciclo de herramientas (todas las respuestas de una vuelta en
   un solo mensaje, máximo unas 6 vueltas), revisión de `stop_reason`, historial en memoria que se
   borra al cerrar sesión. Puede vivir dentro de la sección Preguntas como "Pregunta libre".
4. **Antes de desplegar:**
   - Verificar `Origin`, limitar peticiones por IP y el tamaño de los mensajes.
   - Límite de gasto mensual en la consola del proveedor.
   - Interruptor de consentimiento en Ajustes.
5. **Extras:** acciones de escritura (registrar o confirmar movimientos) siempre con confirmación
   en pantalla, y un set de ~20 preguntas con respuesta conocida sobre los datos de ejemplo para
   ajustar el prompt.

---

## 5. Archivos

| Archivo | Contenido |
| --- | --- |
| `src/app/shared/utils/assistant-tools.ts` | Herramientas del asistente |
| `src/app/shared/utils/quick-questions.ts` | Preguntas y armado de respuestas |
| `src/app/features/quick-questions/` | Pantalla de Preguntas |
| `src/app/shared/utils/analytics.utils.ts` | `queryMovements`, `orderMovements` |
| `src/app/shared/utils/*.spec.ts` | Pruebas |
