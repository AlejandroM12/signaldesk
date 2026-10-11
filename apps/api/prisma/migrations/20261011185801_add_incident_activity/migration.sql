-- CreateEnum
CREATE TYPE "IncidentActivityAction" AS ENUM ('UPDATED');

-- CreateTable
CREATE TABLE "IncidentActivity" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "action" "IncidentActivityAction" NOT NULL,
    "changes" JSONB NOT NULL,
    "actorId" VARCHAR(120),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentActivity_incidentId_createdAt_idx" ON "IncidentActivity"("incidentId", "createdAt");

-- AddForeignKey
ALTER TABLE "IncidentActivity" ADD CONSTRAINT "IncidentActivity_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
