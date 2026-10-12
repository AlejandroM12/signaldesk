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
- `analysisQuota` queda `null` hasta que exista el límite de análisis. Si esa lectura no está disponible, la interfaz no inventa un cupo.

Las métricas viven en la memoria del proceso. Se pierden al reiniciar la API y no se comparten entre instancias. La página inicial las muestra en la sección Operación, con una carga inicial y un botón para actualizar. Un cero es una observación real; un fallo de la consulta no se rellena con ceros inventados.

Antes de un despliegue público hay que proteger `GET /api/metrics` y `GET /api/health/ready`. Un endpoint de diagnóstico abierto no alcanza.

## Estructura

```text
apps/web        Next.js
apps/api        NestJS, Prisma y PostgreSQL
packages/contracts
```

El cliente de Prisma se genera en `apps/api/src/generated` y no se versiona. `pnpm dev` y `pnpm build` lo regeneran.
