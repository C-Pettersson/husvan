-- CreateEnum
CREATE TYPE "LeaseholdBuyoutMethod" AS ENUM ('LAND_ASSESSMENT_SHARE', 'MARKET_VALUE', 'NOT_OFFERED');

-- CreateTable
CREATE TABLE "MunicipalTaxRate" (
    "municipalityCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "municipalRate" DECIMAL(6,4) NOT NULL,
    "regionalRate" DECIMAL(6,4) NOT NULL,
    "sourceUrl" TEXT,

    CONSTRAINT "MunicipalTaxRate_pkey" PRIMARY KEY ("municipalityCode","year")
);

-- CreateTable
CREATE TABLE "LeaseholdPolicy" (
    "id" UUID NOT NULL,
    "municipalityCode" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "buyoutMethod" "LeaseholdBuyoutMethod" NOT NULL,
    "buyoutFactor" DECIMAL(4,3),
    "sourceUrl" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "LeaseholdPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxParameter" (
    "key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "sourceUrl" TEXT NOT NULL,

    CONSTRAINT "TaxParameter_pkey" PRIMARY KEY ("key","year")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaseholdPolicy_municipalityCode_validFrom_key" ON "LeaseholdPolicy"("municipalityCode", "validFrom");

-- AddForeignKey
ALTER TABLE "MunicipalTaxRate" ADD CONSTRAINT "MunicipalTaxRate_municipalityCode_fkey" FOREIGN KEY ("municipalityCode") REFERENCES "Municipality"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaseholdPolicy" ADD CONSTRAINT "LeaseholdPolicy_municipalityCode_fkey" FOREIGN KEY ("municipalityCode") REFERENCES "Municipality"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

