-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentTeam" AS ENUM ('FRONTEND', 'BACKEND', 'UNKNOWN');

-- CreateTable
CREATE TABLE "Incident" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
    "service" VARCHAR(128) NOT NULL,
    "team" "IncidentTeam" NOT NULL DEFAULT 'UNKNOWN',
    "assignee" VARCHAR(120),
    "rootCause" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "externalId" VARCHAR(128),
    "incidentId" UUID NOT NULL,
    "service" VARCHAR(128) NOT NULL,
    "errorType" VARCHAR(128) NOT NULL,
    "message" VARCHAR(4000) NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Incident_service_status_idx" ON "Incident"("service", "status");

-- CreateIndex
CREATE INDEX "Event_incidentId_idx" ON "Event"("incidentId");

-- CreateIndex
CREATE INDEX "Event_service_errorType_timestamp_idx" ON "Event"("service", "errorType", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "Event_source_externalId_key" ON "Event"("source", "externalId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
