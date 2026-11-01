-- CreateEnum
CREATE TYPE "TariffCategory" AS ENUM ('WATER_SEWAGE', 'WASTE', 'ELECTRICITY', 'DISTRICT_HEATING');

-- CreateEnum
CREATE TYPE "CostUnit" AS ENUM ('EACH', 'M2', 'LINEAR_M', 'HOUSE');

-- CreateEnum
CREATE TYPE "ChangesetStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ValueSource" AS ENUM ('USER', 'CLAUDE', 'IMPORT');

-- CreateEnum
CREATE TYPE "HouseStatus" AS ENUM ('CANDIDATE', 'DECLINED', 'PURCHASED', 'SOLD');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('LISTING', 'INSPECTION', 'PIPE_INSPECTION', 'ELECTRICAL_INSPECTION', 'ENERGY_CERTIFICATE', 'INVOICE', 'RECEIPT', 'MANUAL', 'WARRANTY', 'DRAWING', 'PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkItemKind" AS ENUM ('REPLACEMENT', 'REPAIR', 'INVESTIGATION');

-- CreateEnum
CREATE TYPE "AreaLevel" AS ENUM ('NATION', 'MUNICIPALITY', 'POLICE_AREA', 'DESO');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jwks" (
    "id" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "alg" TEXT,
    "crv" TEXT,

    CONSTRAINT "jwks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT,
    "clientDiscoveryId" TEXT,
    "disabled" BOOLEAN DEFAULT false,
    "skipConsent" BOOLEAN,
    "enableEndSession" BOOLEAN,
    "subjectType" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clientCredentialsScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userId" TEXT,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "name" TEXT,
    "uri" TEXT,
    "icon" TEXT,
    "contacts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tos" TEXT,
    "policy" TEXT,
    "softwareId" TEXT,
    "softwareVersion" TEXT,
    "softwareStatement" TEXT,
    "redirectUris" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "postLogoutRedirectUris" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "backchannelLogoutUri" TEXT,
    "backchannelLogoutSessionRequired" BOOLEAN,
    "tokenEndpointAuthMethod" TEXT,
    "applicationType" TEXT,
    "jwks" TEXT,
    "jwksUri" TEXT,
    "grantTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "responseTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requirePKCE" BOOLEAN,
    "dpopBoundAccessTokens" BOOLEAN DEFAULT false,
    "referenceId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "oauthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthResource" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accessTokenTtl" INTEGER,
    "refreshTokenTtl" INTEGER,
    "signingAlgorithm" TEXT,
    "signingKeyId" TEXT,
    "allowedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "customClaims" JSONB,
    "dpopBoundAccessTokensRequired" BOOLEAN DEFAULT false,
    "disabled" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "policyVersion" INTEGER DEFAULT 1,
    "metadata" JSONB,

    CONSTRAINT "oauthResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthClientResource" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3),

    CONSTRAINT "oauthClientResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthRefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "referenceId" TEXT,
    "authorizationCodeId" TEXT,
    "resources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requestedUserInfoClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "revoked" TIMESTAMP(3),
    "rotatedAt" TIMESTAMP(3),
    "rotationReplayResponse" TEXT,
    "rotationReplayExpiresAt" TIMESTAMP(3),
    "authTime" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "oauthRefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthAccessToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "referenceId" TEXT,
    "authorizationCodeId" TEXT,
    "resources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requestedUserInfoClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "refreshId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "revoked" TIMESTAMP(3),
    "confirmation" JSONB,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "oauthAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthConsent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT,
    "referenceId" TEXT,
    "resources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requestedUserInfoClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauthConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauthClientAssertion" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "oauthClientAssertion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Municipality" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "groundSnowLoadKnM2" DECIMAL(4,2),
    "fgeo" DECIMAL(3,2),
    "dvutC" DECIMAL(4,1),
    "cloudburstMapUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Municipality_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "MunicipalTariffChange" (
    "municipalityCode" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "category" "TariffCategory" NOT NULL,
    "changeFraction" DECIMAL(6,4) NOT NULL,
    "sourceUrl" TEXT,

    CONSTRAINT "MunicipalTariffChange_pkey" PRIMARY KEY ("municipalityCode","year","category")
);

-- CreateTable
CREATE TABLE "PriceIndex" (
    "series" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "sourceUrl" TEXT,

    CONSTRAINT "PriceIndex_pkey" PRIMARY KEY ("series","period")
);

-- CreateTable
CREATE TABLE "ComponentType" (
    "type" TEXT NOT NULL,
    "label" JSONB NOT NULL,
    "category" TEXT NOT NULL,
    "attributeSchema" JSONB NOT NULL DEFAULT '{}',
    "allowedSubcomponents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "forecastDefaults" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComponentType_pkey" PRIMARY KEY ("type")
);

-- CreateTable
CREATE TABLE "LifespanProfile" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "match" JSONB NOT NULL DEFAULT '{}',
    "lifespanMinYears" INTEGER NOT NULL,
    "lifespanTypicalYears" INTEGER NOT NULL,
    "lifespanMaxYears" INTEGER NOT NULL,
    "costLowSek" DECIMAL(12,0),
    "costHighSek" DECIMAL(12,0),
    "costUnit" "CostUnit" NOT NULL,
    "priceYear" INTEGER,
    "sources" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "LifespanProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Changeset" (
    "id" UUID NOT NULL,
    "status" "ChangesetStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "ValueSource" NOT NULL,
    "houseId" UUID,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Changeset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "House" (
    "id" UUID NOT NULL,
    "ownerId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "municipalityCode" TEXT,
    "propertyDesignation" TEXT,
    "status" "HouseStatus" NOT NULL DEFAULT 'CANDIDATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "House_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "houseId" UUID,
    "type" "DocumentType" NOT NULL,
    "title" TEXT,
    "sourceUrl" TEXT,
    "filename" TEXT,
    "mime" TEXT,
    "sha256" TEXT,
    "storagePath" TEXT,
    "fullText" TEXT,
    "interpretation" JSONB,
    "documentDate" DATE,
    "amountSek" DECIMAL(12,2),
    "actorId" UUID,
    "changesetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Actor" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "orgNumber" TEXT,
    "roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contact" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "Actor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Component" (
    "id" UUID NOT NULL,
    "houseId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "parentId" UUID,
    "replacesId" UUID,
    "name" TEXT,
    "changesetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Component_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" UUID NOT NULL,
    "houseId" UUID NOT NULL,
    "componentId" UUID,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "unit" TEXT,
    "source" "ValueSource" NOT NULL,
    "documentId" UUID,
    "confidence" DECIMAL(3,2),
    "quote" TEXT,
    "retractedAt" TIMESTAMP(3),
    "changesetId" UUID NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkItem" (
    "id" UUID NOT NULL,
    "houseId" UUID NOT NULL,
    "componentId" UUID,
    "kind" "WorkItemKind" NOT NULL,
    "description" TEXT NOT NULL,
    "yearMin" INTEGER,
    "yearMax" INTEGER,
    "costLowSek" DECIMAL(12,0),
    "costHighSek" DECIMAL(12,0),
    "source" "ValueSource" NOT NULL,
    "documentId" UUID,
    "quote" TEXT,
    "retractedAt" TIMESTAMP(3),
    "changesetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AreaStatistic" (
    "areaLevel" "AreaLevel" NOT NULL,
    "areaCode" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" DECIMAL(14,4) NOT NULL,
    "unit" TEXT,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AreaStatistic_pkey" PRIMARY KEY ("areaLevel","areaCode","key","year")
);

-- CreateTable
CREATE TABLE "Assumption" (
    "id" UUID NOT NULL,
    "houseId" UUID,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "changesetId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Forecast" (
    "id" UUID NOT NULL,
    "houseId" UUID NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assumptions" JSONB NOT NULL,
    "result" JSONB NOT NULL,

    CONSTRAINT "Forecast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "oauthClient_userId_idx" ON "oauthClient"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "oauthClient_clientId_key" ON "oauthClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "oauthResource_identifier_key" ON "oauthResource"("identifier");

-- CreateIndex
CREATE INDEX "oauthClientResource_clientId_idx" ON "oauthClientResource"("clientId");

-- CreateIndex
CREATE INDEX "oauthClientResource_resourceId_idx" ON "oauthClientResource"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "oauthClientResource_clientId_resourceId_uidx" ON "oauthClientResource"("clientId", "resourceId");

-- CreateIndex
CREATE INDEX "oauthRefreshToken_clientId_idx" ON "oauthRefreshToken"("clientId");

-- CreateIndex
CREATE INDEX "oauthRefreshToken_sessionId_idx" ON "oauthRefreshToken"("sessionId");

-- CreateIndex
CREATE INDEX "oauthRefreshToken_userId_idx" ON "oauthRefreshToken"("userId");

-- CreateIndex
CREATE INDEX "oauthRefreshToken_authorizationCodeId_idx" ON "oauthRefreshToken"("authorizationCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "oauthRefreshToken_token_key" ON "oauthRefreshToken"("token");

-- CreateIndex
CREATE INDEX "oauthAccessToken_clientId_idx" ON "oauthAccessToken"("clientId");

-- CreateIndex
CREATE INDEX "oauthAccessToken_sessionId_idx" ON "oauthAccessToken"("sessionId");

-- CreateIndex
CREATE INDEX "oauthAccessToken_userId_idx" ON "oauthAccessToken"("userId");

-- CreateIndex
CREATE INDEX "oauthAccessToken_authorizationCodeId_idx" ON "oauthAccessToken"("authorizationCodeId");

-- CreateIndex
CREATE INDEX "oauthAccessToken_refreshId_idx" ON "oauthAccessToken"("refreshId");

-- CreateIndex
CREATE UNIQUE INDEX "oauthAccessToken_token_key" ON "oauthAccessToken"("token");

-- CreateIndex
CREATE INDEX "oauthConsent_clientId_idx" ON "oauthConsent"("clientId");

-- CreateIndex
CREATE INDEX "oauthConsent_userId_idx" ON "oauthConsent"("userId");

-- CreateIndex
CREATE INDEX "LifespanProfile_type_idx" ON "LifespanProfile"("type");

-- CreateIndex
CREATE INDEX "Changeset_houseId_status_idx" ON "Changeset"("houseId", "status");

-- CreateIndex
CREATE INDEX "House_ownerId_idx" ON "House"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Document_sha256_key" ON "Document"("sha256");

-- CreateIndex
CREATE INDEX "Document_houseId_idx" ON "Document"("houseId");

-- CreateIndex
CREATE INDEX "Component_houseId_idx" ON "Component"("houseId");

-- CreateIndex
CREATE INDEX "Component_parentId_idx" ON "Component"("parentId");

-- CreateIndex
CREATE INDEX "Component_replacesId_idx" ON "Component"("replacesId");

-- CreateIndex
CREATE INDEX "Observation_houseId_componentId_key_idx" ON "Observation"("houseId", "componentId", "key");

-- CreateIndex
CREATE INDEX "Observation_changesetId_idx" ON "Observation"("changesetId");

-- CreateIndex
CREATE INDEX "WorkItem_houseId_idx" ON "WorkItem"("houseId");

-- CreateIndex
CREATE INDEX "Assumption_houseId_key_idx" ON "Assumption"("houseId", "key");

-- CreateIndex
CREATE INDEX "Forecast_houseId_calculatedAt_idx" ON "Forecast"("houseId", "calculatedAt");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthClient" ADD CONSTRAINT "oauthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthClientResource" ADD CONSTRAINT "oauthClientResource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthClientResource" ADD CONSTRAINT "oauthClientResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "oauthResource"("identifier") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthRefreshToken" ADD CONSTRAINT "oauthRefreshToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthRefreshToken" ADD CONSTRAINT "oauthRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthRefreshToken" ADD CONSTRAINT "oauthRefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthAccessToken" ADD CONSTRAINT "oauthAccessToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthAccessToken" ADD CONSTRAINT "oauthAccessToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthAccessToken" ADD CONSTRAINT "oauthAccessToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthAccessToken" ADD CONSTRAINT "oauthAccessToken_refreshId_fkey" FOREIGN KEY ("refreshId") REFERENCES "oauthRefreshToken"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthConsent" ADD CONSTRAINT "oauthConsent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "oauthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauthConsent" ADD CONSTRAINT "oauthConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MunicipalTariffChange" ADD CONSTRAINT "MunicipalTariffChange_municipalityCode_fkey" FOREIGN KEY ("municipalityCode") REFERENCES "Municipality"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifespanProfile" ADD CONSTRAINT "LifespanProfile_type_fkey" FOREIGN KEY ("type") REFERENCES "ComponentType"("type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Changeset" ADD CONSTRAINT "Changeset_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "House" ADD CONSTRAINT "House_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "House" ADD CONSTRAINT "House_municipalityCode_fkey" FOREIGN KEY ("municipalityCode") REFERENCES "Municipality"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Actor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_changesetId_fkey" FOREIGN KEY ("changesetId") REFERENCES "Changeset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_type_fkey" FOREIGN KEY ("type") REFERENCES "ComponentType"("type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Component"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "Component"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Component" ADD CONSTRAINT "Component_changesetId_fkey" FOREIGN KEY ("changesetId") REFERENCES "Changeset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_changesetId_fkey" FOREIGN KEY ("changesetId") REFERENCES "Changeset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkItem" ADD CONSTRAINT "WorkItem_changesetId_fkey" FOREIGN KEY ("changesetId") REFERENCES "Changeset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assumption" ADD CONSTRAINT "Assumption_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assumption" ADD CONSTRAINT "Assumption_changesetId_fkey" FOREIGN KEY ("changesetId") REFERENCES "Changeset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Forecast" ADD CONSTRAINT "Forecast_houseId_fkey" FOREIGN KEY ("houseId") REFERENCES "House"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
