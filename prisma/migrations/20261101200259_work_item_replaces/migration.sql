-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "replacesId" UUID;

-- CreateIndex
CREATE INDEX "WorkItem_replacesId_idx" ON "WorkItem"("replacesId");

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "WorkItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
