-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "allowed_email" (
    "email" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allowed_email_pkey" PRIMARY KEY ("email")
);

-- AddForeignKey
ALTER TABLE "allowed_email" ADD CONSTRAINT "allowed_email_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every user that exists today was seeded by the owner, so each one
-- keeps access and administers the allowlist. In production that is one user.
INSERT INTO "allowed_email" ("email", "addedById")
SELECT "email", "id" FROM "user"
ON CONFLICT ("email") DO NOTHING;

UPDATE "user" SET "role" = 'ADMIN';
