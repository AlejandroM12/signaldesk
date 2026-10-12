-- CreateEnum
CREATE TYPE "AnalysisOperationState" AS ENUM ('RUNNING', 'FAILED');

-- CreateTable
CREATE TABLE "AnalysisOperation" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(80) NOT NULL,
    "state" "AnalysisOperationState" NOT NULL,
    "leaseExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AnalysisOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRateState" (
    "id" INTEGER NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    "requestCount" INTEGER NOT NULL,

    CONSTRAINT "AnalysisRateState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisOperation_incidentId_idempotencyKey_key" ON "AnalysisOperation"("incidentId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "AnalysisOperation" ADD CONSTRAINT "AnalysisOperation_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One shared counter for the whole API. It is not a per-user limit.
INSERT INTO "AnalysisRateState" ("id", "windowStart", "requestCount")
VALUES (1, CURRENT_TIMESTAMP, 0);
