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

## Comandos

```powershell
pnpm db:up
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
- `pnpm dev` compila los contratos y arranca la web en el puerto 3000 y la API en el puerto 3001.
- `pnpm test` ejecuta las pruebas unitarias de la API. `pnpm test:e2e` también levanta Prisma y necesita PostgreSQL en marcha.
- `pnpm db:down` detiene PostgreSQL y conserva el volumen de datos.

La página inicial consulta `GET /api/health` y muestra si la API está disponible.

## Estructura

```text
apps/web        Next.js
apps/api        NestJS, Prisma y PostgreSQL
packages/contracts
```

El cliente de Prisma se genera en `apps/api/src/generated` y no se versiona. `pnpm dev` y `pnpm build` lo regeneran.
