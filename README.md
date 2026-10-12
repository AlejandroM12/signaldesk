# SignalDesk

Plataforma de gestión y análisis de incidentes técnicos. Este repositorio contiene la base local: frontend Next.js, API NestJS, contratos compartidos y PostgreSQL.

## Requisitos

- Node.js 22.22.3 o superior, o Node.js 24.15 o superior
- pnpm 11
- Docker Desktop, con Docker Compose

## Instalación

En PowerShell, desde la raíz del repositorio:

```powershell
pnpm install
Copy-Item .env.example .env
```

`.env` queda solo en tu máquina. `.env.example` no contiene secretos: los valores de PostgreSQL son placeholders para una base local.

## Variables de entorno

| Variable | Dónde se usa | Descripción |
| --- | --- | --- |
| `API_PORT` | API | Puerto de NestJS. Por defecto `3001`. |
| `CORS_ORIGIN` | API | Origen permitido del frontend. Por defecto `http://localhost:3000`. |
| `NEXT_PUBLIC_API_URL` | Web | URL pública de la API. Es la única variable expuesta al navegador. |
| `POSTGRES_USER` | Docker y API | Usuario local de PostgreSQL. |
| `POSTGRES_PASSWORD` | Docker y API | Contraseña local de PostgreSQL. |
| `POSTGRES_DB` | Docker y API | Nombre de la base local. |
| `POSTGRES_PORT` | Docker | Puerto publicado en el host. |
| `DATABASE_URL` | API y Prisma | Cadena de conexión. No la uses en el frontend. |
| `EVENT_CORRELATION_WINDOW_MINUTES` | API | Minutos para asociar un evento a un incidente abierto del mismo servicio y tipo de error. Si no está definida, usa 30. |
| `OPENAI_API_KEY` | API | Clave de OpenAI. Solo vive en el servidor. Si falta, el análisis responde que no está configurado y el resto de la API sigue funcionando. |
| `OPENAI_MODEL` | API | Modelo de la llamada. Por defecto `gpt-6-luna`. |
| `OPENAI_TIMEOUT_MS` | API | Tiempo máximo de la llamada, en milisegundos. Por defecto `20000`. |
| `OPENAI_MAX_OUTPUT_TOKENS` | API | Tope de tokens de salida, incluidos los de razonamiento. Por defecto `1200`. |
| `OPENAI_REASONING_EFFORT` | API | Esfuerzo de razonamiento enviado a la API. Por defecto `none`, para no gastar tokens de razonamiento. Algunos modelos rechazan `none`. |
| `NEW_RELIC_ENABLED` | API | `true` inicia el agente de New Relic. Cualquier otro valor lo deja apagado. |
| `NEW_RELIC_APP_NAME` | API | Nombre estable en New Relic. El valor previsto es `SignalDesk-API`. |
| `NEW_RELIC_LICENSE_KEY` | API | Clave de licencia. Solo en el `.env` local o en el gestor de secretos. No va al frontend. |

## Comandos

```powershell
pnpm db:up
pnpm db:migrate -- --name add_incidents_and_events
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
pnpm dev:api
pnpm dev:web
pnpm test
pnpm test:e2e
pnpm lint
pnpm build
pnpm db:down
```

- `pnpm db:up` levanta PostgreSQL.
- `pnpm db:migrate` crea y aplica una migración en desarrollo. El nombre va después de `--`.
- `pnpm db:migrate:deploy` aplica migraciones ya existentes.
- `pnpm db:seed` carga incidentes y eventos sintéticos. Se puede ejecutar más de una vez.
- `pnpm dev` compila los contratos y arranca la web en el puerto 3000 y la API en el puerto 3001.
- `pnpm test` ejecuta las pruebas unitarias de la API. `pnpm test:e2e` también levanta Prisma y necesita PostgreSQL en marcha.
- `pnpm db:down` detiene PostgreSQL y conserva el volumen de datos.

Para reiniciar en desarrollo, detenés el proceso con `Ctrl+C` en la terminal donde corre `pnpm dev`, `pnpm dev:api` o `pnpm dev:web`, y volvés a ejecutar el mismo comando. La web y la API se reinician por separado si las arrancaste con `dev:web` y `dev:api`.

La página inicial lista los incidentes guardados. El detalle de cada incidente muestra sus eventos en orden cronológico.

`GET /api/health` informa si el proceso de la API está vivo. No consulta PostgreSQL: un problema de base no debe marcar la liveness como caída. `GET /api/health/ready` hace un `SELECT 1` y responde `503` si la base no contesta.

`GET /api/metrics` devuelve contadores en memoria desde el arranque de ese proceso. Es un diagnóstico local del MVP. No tiene autenticación: hay que protegerlo antes de exponer la API en público. No incluye secretos, mensajes de eventos, prompts ni identificadores de cada solicitud.

`GET /api/incidents` devuelve incidentes paginados (`page`, `limit`) con filtros opcionales `status`, `severity`, `service` y `team`. El orden es por fecha de creación descendente. `summary` cuenta abiertos, en investigación y resueltos en toda la base, sin aplicar esos filtros.

`GET /api/incidents/:id` devuelve un incidente y sus eventos ordenados por timestamp. Si no existe, responde `404`.

`PATCH /api/incidents/:id` actualiza el estado, la causa raíz, la resolución, el equipo y el responsable. Hay que enviar `expectedUpdatedAt` con el `updatedAt` recibido en la última lectura. Si otro cambio ya avanzó esa fecha, la API responde `409` y no escribe nada. Un campo omitido no se modifica; `null` borra la causa raíz, la resolución o el responsable. El equipo no acepta `null`. No se pueden cambiar el id, la fecha de creación ni los eventos.

Transiciones permitidas: `OPEN → INVESTIGATING`, `INVESTIGATING → RESOLVED`, `INVESTIGATING → OPEN` y `RESOLVED → OPEN`. Se puede conservar el estado actual. `OPEN → RESOLVED` no está permitido: primero hay que investigarlo. `CLOSED` existe en el modelo, pero este ciclo no entra ni sale de ese estado. Resolver exige una resolución con texto. Reabrir no borra la causa ni la resolución, y sí limpia `resolvedAt`.

Cada operación que cambia algo escribe una fila en `IncidentActivity`, en la misma transacción. Si el historial falla, la actualización se revierte. La acción es `UPDATED` y `changes` guarda el valor anterior y el nuevo de cada campo modificado. `actorId` queda `null` porque todavía no hay autenticación.

`GET /api/incidents/:id/activity` devuelve ese historial, del más reciente al más antiguo. Si el incidente no existe, responde `404`.

`POST /api/events` valida un evento, lo guarda y lo asocia a un incidente. Dos eventos se agrupan solo si tienen el mismo servicio, el mismo tipo de error y sus timestamps caen dentro de `EVENT_CORRELATION_WINDOW_MINUTES` de un incidente abierto (`OPEN` o `INVESTIGATING`). Un evento de otro servicio, o el mismo error fuera de esa ventana, abre otro incidente. La causa raíz y la solución quedan vacías. Un identificador externo se deduplica junto con `source`; si se repite, la API responde `409`. Esa respuesta no repite el resultado original.

## Observabilidad

Cada solicitud HTTP recibe un `requestId`. Si el header `X-Request-Id` trae entre 8 y 64 caracteres de `[A-Za-z0-9_-]`, se usa ese valor. Si falta o no cumple el formato, la API genera uno con `crypto.randomUUID()` y no propaga el valor inválido. La respuesta lo devuelve en `X-Request-Id`.

Al terminar la solicitud se escribe una línea JSON con método, ruta normalizada, status y duración. La duración usa `process.hrtime`. La ruta es el patrón de Nest, por ejemplo `/api/health`, no la URL con ids ni query string. No se registran cuerpos, headers de autorización, claves, mensajes de eventos, metadata ni prompts. Un error HTTP conocido queda en esa línea de acceso. Una excepción no controlada agrega una sola línea `http_error` con el `requestId` y el status `500`, sin el texto de la excepción. Las métricas no se registran dos veces para el mismo resultado.

`GET /api/metrics` se consulta así:

```powershell
Invoke-RestMethod http://localhost:3001/api/metrics
```

Los contadores significan:

- `http.requests`, `http.errors` y `http.durationMsTotal`: cada solicitud cuenta una vez. El error es un status de 400 o más. La media es `durationMsTotal / requests` cuando hay solicitudes.
- `events.accepted`: eventos persistidos. `events.duplicates`: conflictos `409`, que no cuentan como aceptados ni como rechazados. `events.rejected`: validación `400` o fallo `5xx` de `POST /api/events`.
- `incidents.created`: incidentes nuevos creados por la ingesta. No incluye los que ya existían.
- `analysis.succeeded`: análisis nuevos guardados después de llamar al proveedor. `analysis.failed`: llamadas al proveedor que no se guardaron. `analysis.discarded`: la llamada encontró un análisis que otra solicitud ya había guardado para la misma clave. `analysis.providerCalls` y `analysis.durationMsTotal` miden solo llamadas reales al proveedor. Recuperar un resultado ya guardado no suma ninguna de esas cifras. `analysis.quotaRejected` es el límite local, antes de llamar al proveedor. `providerErrors` separa `timeout`, `rate_limit`, `provider`, `invalid_output` y `not_configured`.
- `analysisQuota` lee la fila de PostgreSQL: `requestCount` dentro de la ventana y el límite configurado. Si esa lectura falla, el campo es `null` y la interfaz muestra que no está disponible.

Las métricas viven en la memoria del proceso. Se pierden al reiniciar la API y no se comparten entre instancias. La página inicial las muestra en la sección Operación, con una carga inicial y un botón para actualizar. Un cero es una observación real; un fallo de la consulta no se rellena con ceros inventados.

Antes de un despliegue público hay que proteger `GET /api/metrics` y `GET /api/health/ready`. Un límite anónimo y un endpoint de diagnóstico abierto no alcanzan.

## New Relic APM

El agente oficial `newrelic` instrumenta la API NestJS: transacciones HTTP, tiempos y errores del proceso. No instrumenta Next.js. Las métricas en memoria de `GET /api/metrics` siguen siendo independientes.

El agente se carga en el primer módulo de `main.ts`, antes de que NestJS importe Express y el resto de la aplicación. Antes de eso lee el `.env` del directorio de trabajo y, si hace falta, el de la raíz del monorepo. Una variable que ya esté en el proceso no se pisa. `NEW_RELIC_ENABLED` tiene que ser exactamente `true` y `NEW_RELIC_LICENSE_KEY` no puede estar vacía. Si falta la clave, la API arranca igual y no imprime ningún secreto. Las pruebas unitarias y e2e corren bajo Jest y no cargan el agente.

Para dejarlo apagado, en el `.env` local:

```text
NEW_RELIC_ENABLED=false
NEW_RELIC_APP_NAME=SignalDesk-API
NEW_RELIC_LICENSE_KEY=
```

Para habilitarlo, pegá la clave solo en ese `.env` y cambiá `NEW_RELIC_ENABLED=true`. Después, desde PowerShell en la raíz del repositorio:

```powershell
pnpm dev:api
```

Para una sesión apagada aunque el `.env` diga `true`:

```powershell
$env:NEW_RELIC_ENABLED = "false"
pnpm dev:api
```

El proceso de producción usa el mismo arranque:

```powershell
pnpm --filter @signaldesk/api start:prod
```

En [New Relic](https://one.newrelic.com/) abrí APM y buscá `SignalDesk-API`. Generá tráfico, por ejemplo `Invoke-RestMethod http://localhost:3001/api/health`, y esperá unos minutos. Las transacciones deberían verse con la ruta de Nest, como `GET /api/health` o `GET /api/incidents/:id`, no con el id de cada incidente. Esta guía no confirma que los datos hayan llegado: eso depende de una clave real.

Si no aparece nada, revisá que la API se haya reiniciado después de cambiar el `.env`, que `NEW_RELIC_ENABLED` sea `true`, que la clave corresponda a la misma región de la cuenta y que el log de la API no diga que el agente quedó apagado. No hace falta un archivo de configuración con la clave: `apps/api/newrelic.js` la lee del entorno.

No se envían cuerpos, headers, parámetros de ruta ni de query. El agente reemplaza el mensaje de las excepciones por un texto genérico y redacta ese mensaje en la primera línea del stack. El SQL de los traces queda ofuscado. El reenvío de logs está apagado, así que el texto de un análisis no sale por los logs de la aplicación. El monitoreo de navegador está apagado. Los status `400`, `401`, `403`, `404`, `409`, `422` y `429` no se cuentan como errores de APM. Las métricas nativas de V8 (`@newrelic/native-metrics`) no están habilitadas. `request.uri` puede conservar la ruta concreta, incluido el id de un incidente; el nombre de la transacción sigue siendo el patrón de Nest.

Si `NEW_RELIC_ENABLED` no es exactamente `true`, o si falta la clave, el agente no arranca y la API sigue disponible. Una clave vacía no se imprime.

Cuando el agente sí arrancó, cada ejecución real del análisis también suma métricas agregadas. El agente les antepone `Custom/`. Los nombres que quedan en New Relic son `Custom/SignalDesk/Analysis/Success`, `Custom/SignalDesk/Analysis/Failure`, `Custom/SignalDesk/Analysis/Failure/Timeout`, `Custom/SignalDesk/Analysis/Failure/InvalidOutput`, `Custom/SignalDesk/Analysis/Failure/Provider`, `Custom/SignalDesk/Analysis/Failure/ProviderRateLimit`, `Custom/SignalDesk/Analysis/Failure/NotConfigured`, `Custom/SignalDesk/Analysis/Discarded`, `Custom/SignalDesk/Analysis/DurationMs` y `Custom/SignalDesk/RateLimit/Rejected`. La duración usa el mismo reloj monotónico del proceso. No llevan id de incidente, prompt ni texto del análisis. Leer un análisis guardado no suma. Un fallo del agente no cambia el resultado del análisis. Esta guía no confirma que esas métricas hayan aparecido en la cuenta.

Para comprobar solo la ingestión, sin análisis ni OpenAI, hay un script local. Exige `NEW_RELIC_ENABLED=true` y una clave no vacía. Registra una sola métrica fija, `SignalDesk/Probe/Ingestion`, y pide el envío final antes de salir. No forma parte de `dev`, `build` ni `start:prod`.

```powershell
pnpm --filter @signaldesk/api newrelic:probe
```

Después de un minuto:

```sql
SELECT count(newrelic.timeslice.value)
FROM Metric
WHERE appName = 'SignalDesk-API'
AND metricTimesliceName = 'Custom/SignalDesk/Probe/Ingestion'
SINCE 30 minutes ago
```

Esa consulta no confirma el envío hasta que la ejecutes con la clave real. `average(newrelic.timeslice.value)` puede quedar en 0 porque el conteo se guarda con total cero.

## Análisis asistido

El detalle de un incidente puede pedir una hipótesis a partir de sus eventos reales. El resultado es una ayuda de diagnóstico: no confirma la causa raíz, no completa la resolución y no cambia el estado. Esos campos solo cambian si una persona los guarda en el formulario.

La web no llama a OpenAI. `POST /api/incidents/:id/analyze` arma un contexto limitado, pide una salida estructurada y, si la respuesta cita solo eventos de ese incidente, guarda el análisis. `GET /api/incidents/:id/analyses` y `GET /api/incidents/:id/analyses/:analysisId` leen lo ya guardado y no vuelven a llamar al proveedor. El módulo separa el caso de uso, el adaptador de OpenAI, el recorte del contexto y la validación. No hay herramientas, agentes ni embeddings.

No hay autenticación. `ANALYSIS_RATE_LIMIT` (por defecto 10) y `ANALYSIS_RATE_WINDOW_MS` (por defecto 60000) limitan los análisis nuevos de toda la API, no de cada usuario: la aplicación no tiene identidad contra la cual contar. El cupo vive en PostgreSQL y se descuenta antes de llamar a OpenAI, así que vale entre procesos y una solicitud rechazada no genera costo. Releer el historial, el incidente o la salud no consume cupo. Tampoco lo consume repetir una clave que ya tiene un análisis guardado. Un servicio expuesto en público no debe depender solo de este límite anónimo.

Si falta `OPENAI_API_KEY`, ese endpoint responde `503` y la API igual arranca. Un timeout responde `504`, un fallo del proveedor `502`, el límite de la API o del proveedor `429` y una respuesta inválida o con eventos ajenos `422`. Esos casos no se guardan como análisis exitosos. La clave no se escribe en la base, en los logs ni en la respuesta.

Un análisis viejo sigue disponible después de que lleguen eventos nuevos, y la interfaz avisa que puede no describir el incidente actual. Si el contexto se recortó, también queda registrado. La misma `idempotencyKey` en el mismo incidente identifica una sola operación. PostgreSQL guarda esa operación con un arrendamiento: la otra solicitud espera y, si la primera termina bien, recibe el mismo análisis sin llamar al proveedor. La misma clave en otro incidente es otra operación y no devuelve el análisis ajeno. Si el proveedor falla, la operación queda `FAILED` y un reintento explícito con la misma clave puede volver a llamar. Si el proceso cae, el arrendamiento vence (el timeout configurado de OpenAI más 15 segundos) y un reintento posterior puede tomar la operación; no queda bloqueada para siempre. Antes de guardar, la solicitud vuelve a comprobar que sigue siendo dueña del arrendamiento. Si otro proceso ya lo tomó, no escribe el análisis ni pisa esa operación. Eso no garantiza una única llamada externa: una caída después de haber enviado la solicitud, o una llamada que sigue en curso cuando vence el arrendamiento, puede producir una segunda invocación. Sin `idempotencyKey` no hay coordinación entre solicitudes concurrentes.

### Configurar OpenAI

1. Creá una clave en [API keys](https://platform.openai.com/api-keys).
2. Copiala en el `.env` local como `OPENAI_API_KEY`. No la subas al repositorio.
3. Reiniciá la API. El modelo por defecto es `gpt-6-luna` porque la documentación de OpenAI lo presenta para tareas de alto volumen y admite salida estructurada. El 11 de octubre de 2026, la tarifa estándar de contexto corto publicada era USD 0,10 por millón de tokens de entrada y USD 0,50 por millón de salida. Esos valores cambian: revisá [el modelo](https://developers.openai.com/api/docs/models/gpt-6-luna) y [los precios](https://developers.openai.com/api/docs/pricing).
4. Para usar otro modelo, cambiá `OPENAI_MODEL`. Si ese modelo no acepta `reasoning.effort = none`, ajustá `OPENAI_REASONING_EFFORT`. Subir el esfuerzo consume más tokens de salida.
5. El consumo y los límites de gasto se controlan en la plataforma de OpenAI: [Usage](https://platform.openai.com/usage) y [Limits](https://platform.openai.com/settings/organization/limits). SignalDesk no calcula un precio por análisis.

Las pruebas unitarias y e2e sustituyen al proveedor y no consumen tokens. Sin una clave, el botón del detalle muestra el error de configuración y el resto de la página sigue usable.

## Estructura

```text
apps/web        Next.js
apps/api        NestJS, Prisma y PostgreSQL
packages/contracts
```

El cliente de Prisma se genera en `apps/api/src/generated` y no se versiona. `pnpm dev` y `pnpm build` lo regeneran.
