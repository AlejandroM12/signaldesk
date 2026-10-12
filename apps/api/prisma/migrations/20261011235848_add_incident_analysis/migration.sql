-- CreateTable
CREATE TABLE "IncidentAnalysis" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "model" VARCHAR(64) NOT NULL,
    "promptVersion" VARCHAR(64) NOT NULL,
    "result" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "idempotencyKey" VARCHAR(80),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentAnalysis_incidentId_createdAt_idx" ON "IncidentAnalysis"("incidentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentAnalysis_incidentId_idempotencyKey_key" ON "IncidentAnalysis"("incidentId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "IncidentAnalysis" ADD CONSTRAINT "IncidentAnalysis_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
