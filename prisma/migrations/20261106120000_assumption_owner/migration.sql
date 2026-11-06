-- AlterTable
ALTER TABLE "Assumption" ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "Assumption_ownerId_key_idx" ON "Assumption"("ownerId", "key");

-- AddForeignKey
ALTER TABLE "Assumption" ADD CONSTRAINT "Assumption_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: a default for all houses used to have no owner, and nothing records
-- who set it. They date from when the first administrator was the only user, so
-- they go to that user. Without an administrator there is nobody to give them
-- to, and a row without an owner is no longer read.
UPDATE "Assumption"
SET "ownerId" = (
  SELECT "id" FROM "user" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1
)
WHERE "houseId" IS NULL;
