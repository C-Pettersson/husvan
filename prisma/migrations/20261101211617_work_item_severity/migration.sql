-- CreateEnum
CREATE TYPE "WorkItemSeverity" AS ENUM ('MINOR', 'RISK', 'DEFECT', 'SEVERE');

-- AlterTable
ALTER TABLE "WorkItem" ADD COLUMN     "severity" "WorkItemSeverity";
