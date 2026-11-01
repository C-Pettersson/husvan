-- AlterTable
ALTER TABLE "LifespanProfile" ADD COLUMN     "repaintCostHighSek" DECIMAL(12,0),
ADD COLUMN     "repaintCostLowSek" DECIMAL(12,0),
ADD COLUMN     "repaintMaxYears" INTEGER,
ADD COLUMN     "repaintMinYears" INTEGER,
ADD COLUMN     "repaintTypicalYears" INTEGER;
