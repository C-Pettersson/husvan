-- AlterTable
ALTER TABLE "allowed_email" ADD COLUMN     "blockedAt" TIMESTAMP(3);

-- Two people can hold the same listing, so a file's hash is unique per house.
DROP INDEX "Document_sha256_key";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "sizeBytes" INTEGER;

-- CreateTable
CREATE TABLE "signup_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "open" BOOLEAN NOT NULL DEFAULT false,
    "accountsPerDay" INTEGER NOT NULL DEFAULT 10,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signup_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_mail" (
    "id" UUID NOT NULL,
    "recipientHash" TEXT NOT NULL,
    "newAddress" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_mail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_mail_recipientHash_createdAt_idx" ON "login_mail"("recipientHash", "createdAt");

-- CreateIndex
CREATE INDEX "login_mail_newAddress_createdAt_idx" ON "login_mail"("newAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Document_houseId_sha256_key" ON "Document"("houseId", "sha256");
