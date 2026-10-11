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

La página inicial consulta `GET /api/health` y muestra si la API está disponible.

`POST /api/events` valida un evento, lo guarda y lo asocia a un incidente. Dos eventos se agrupan solo si tienen el mismo servicio, el mismo tipo de error y sus timestamps caen dentro de `EVENT_CORRELATION_WINDOW_MINUTES` de un incidente abierto (`OPEN` o `INVESTIGATING`). Un evento de otro servicio, o el mismo error fuera de esa ventana, abre otro incidente. La causa raíz y la solución quedan vacías. Un identificador externo se deduplica junto con `source`; si se repite, la API responde `409`. Esa respuesta no repite el resultado original.

## Estructura

```text
apps/web        Next.js
apps/api        NestJS, Prisma y PostgreSQL
packages/contracts
```

El cliente de Prisma se genera en `apps/api/src/generated` y no se versiona. `pnpm dev` y `pnpm build` lo regeneran.
