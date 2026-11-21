-- AlterTable
ALTER TABLE "RepCycleTeamPeriod" ADD COLUMN     "scopeConfigured" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TeamScopeArea" (
    "teamPeriodId" UUID NOT NULL,
    "areaId" UUID NOT NULL,

    CONSTRAINT "TeamScopeArea_pkey" PRIMARY KEY ("teamPeriodId","areaId")
);

-- CreateTable
CREATE TABLE "TeamScopeProduct" (
    "teamPeriodId" UUID NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "TeamScopeProduct_pkey" PRIMARY KEY ("teamPeriodId","productId")
);

-- CreateTable
CREATE TABLE "TeamScopeTarget" (
    "id" UUID NOT NULL,
    "teamPeriodId" UUID NOT NULL,
    "repCycleTargetId" UUID NOT NULL,
    "requiredVisits" INTEGER NOT NULL,

    CONSTRAINT "TeamScopeTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitTeamCredit" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "teamScopeTargetId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitTeamCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitTeamProduct" (
    "creditId" UUID NOT NULL,
    "productId" UUID NOT NULL,

    CONSTRAINT "VisitTeamProduct_pkey" PRIMARY KEY ("creditId","productId")
);

-- CreateIndex
CREATE INDEX "TeamScopeArea_areaId_idx" ON "TeamScopeArea"("areaId");

-- CreateIndex
CREATE INDEX "TeamScopeProduct_productId_idx" ON "TeamScopeProduct"("productId");

-- CreateIndex
CREATE INDEX "TeamScopeTarget_repCycleTargetId_idx" ON "TeamScopeTarget"("repCycleTargetId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamScopeTarget_teamPeriodId_repCycleTargetId_key" ON "TeamScopeTarget"("teamPeriodId", "repCycleTargetId");

-- CreateIndex
CREATE INDEX "VisitTeamCredit_teamScopeTargetId_idx" ON "VisitTeamCredit"("teamScopeTargetId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitTeamCredit_visitId_teamScopeTargetId_key" ON "VisitTeamCredit"("visitId", "teamScopeTargetId");

-- CreateIndex
CREATE INDEX "VisitTeamProduct_productId_idx" ON "VisitTeamProduct"("productId");

-- AddForeignKey
ALTER TABLE "TeamScopeArea" ADD CONSTRAINT "TeamScopeArea_teamPeriodId_fkey" FOREIGN KEY ("teamPeriodId") REFERENCES "RepCycleTeamPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamScopeArea" ADD CONSTRAINT "TeamScopeArea_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamScopeProduct" ADD CONSTRAINT "TeamScopeProduct_teamPeriodId_fkey" FOREIGN KEY ("teamPeriodId") REFERENCES "RepCycleTeamPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamScopeProduct" ADD CONSTRAINT "TeamScopeProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamScopeTarget" ADD CONSTRAINT "TeamScopeTarget_teamPeriodId_fkey" FOREIGN KEY ("teamPeriodId") REFERENCES "RepCycleTeamPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamScopeTarget" ADD CONSTRAINT "TeamScopeTarget_repCycleTargetId_fkey" FOREIGN KEY ("repCycleTargetId") REFERENCES "RepCycleTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitTeamCredit" ADD CONSTRAINT "VisitTeamCredit_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitTeamCredit" ADD CONSTRAINT "VisitTeamCredit_teamScopeTargetId_fkey" FOREIGN KEY ("teamScopeTargetId") REFERENCES "TeamScopeTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitTeamProduct" ADD CONSTRAINT "VisitTeamProduct_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "VisitTeamCredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitTeamProduct" ADD CONSTRAINT "VisitTeamProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
