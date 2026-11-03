-- AlterTable
ALTER TABLE "Component" ADD COLUMN     "correctsId" UUID,
ADD COLUMN     "documentId" UUID,
ADD COLUMN     "quote" TEXT;

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "confidence" DECIMAL(3,2);

-- CreateTable
CREATE TABLE "Retraction" (
    "id" UUID NOT NULL,
    "houseId" UUID NOT NULL,
    "observationId" UUID NOT NULL,
    "reason" TEXT,
    "changesetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Retraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Retraction_houseId_idx" ON "Retraction"("houseId");

-- CreateIndex
CREATE INDEX "Retraction_observationId_idx" ON "Retraction"("observationId");

-- CreateIndex
CREATE INDEX "Retraction_changesetId_idx" ON "Retraction"("changesetId");

-- CreateIndex
CREATE INDEX "Component_correctsId_idx" ON "Component"("correctsId");

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_correctsId_fkey" FOREIGN KEY ("correctsId") REFERENCES "Component"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retraction" ADD CONSTRAINT "Retraction_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retraction" ADD CONSTRAINT "Retraction_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retraction" ADD CONSTRAINT "Retraction_changesetId_fkey" FOREIGN KEY ("changesetId") REFERENCES "Changeset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
