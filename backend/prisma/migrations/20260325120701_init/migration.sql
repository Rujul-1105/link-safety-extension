-- CreateTable
CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanResult" (
    "id" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "mlScore" DOUBLE PRECISION NOT NULL,
    "signals" JSONB NOT NULL,
    "fromCache" BOOLEAN NOT NULL DEFAULT false,
    "scanDurationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT NOT NULL,

    CONSTRAINT "ScanResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlaggedDomain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "reportCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlaggedDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_tokenHash_key" ON "UserDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "UserDevice_tokenHash_idx" ON "UserDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "ScanResult_urlHash_idx" ON "ScanResult"("urlHash");

-- CreateIndex
CREATE INDEX "ScanResult_createdAt_idx" ON "ScanResult"("createdAt");

-- CreateIndex
CREATE INDEX "ScanResult_score_idx" ON "ScanResult"("score");

-- CreateIndex
CREATE UNIQUE INDEX "FlaggedDomain_domain_key" ON "FlaggedDomain"("domain");

-- CreateIndex
CREATE INDEX "FlaggedDomain_domain_idx" ON "FlaggedDomain"("domain");

-- AddForeignKey
ALTER TABLE "ScanResult" ADD CONSTRAINT "ScanResult_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "UserDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
