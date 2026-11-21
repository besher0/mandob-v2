-- CreateEnum
CREATE TYPE "PharmacyAffiliation" AS ENUM ('INDEPENDENT', 'UNION', 'CLINIC', 'HOSPITAL', 'GOVERNMENT');

-- CreateEnum
CREATE TYPE "HospitalKind" AS ENUM ('PUBLIC', 'PRIVATE', 'SPECIALIZED', 'MEDICAL_CENTER');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID');

-- CreateEnum
CREATE TYPE "ReportPeriod" AS ENUM ('DAILY', 'WEEKLY', 'CUSTOM');

-- AlterTable
ALTER TABLE "RepProfile" ADD COLUMN     "leaveApproverId" UUID;

-- AlterTable
ALTER TABLE "PharmacyProfile" ADD COLUMN     "affiliation" "PharmacyAffiliation";

-- AlterTable
ALTER TABLE "HospitalProfile" ADD COLUMN     "kind" "HospitalKind";

-- AlterTable
ALTER TABLE "RepCycleProfile" ADD COLUMN     "aCoverageTarget" DOUBLE PRECISION,
ADD COLUMN     "managerInstructions" TEXT;

-- AlterTable
ALTER TABLE "RepCycleProduct" ADD COLUMN     "guidance" TEXT,
ADD COLUMN     "priority" INTEGER;

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "approverId" UUID,
ADD COLUMN     "clientRef" UUID,
ADD COLUMN     "type" "LeaveType";

-- CreateTable
CREATE TABLE "LeaveAttachment" (
    "id" UUID NOT NULL,
    "leaveId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "content" BYTEA NOT NULL,

    CONSTRAINT "LeaveAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepReport" (
    "id" UUID NOT NULL,
    "clientRef" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "repId" UUID NOT NULL,
    "period" "ReportPeriod" NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepReportTeam" (
    "reportId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "RepReportTeam_pkey" PRIMARY KEY ("reportId","teamId")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveAttachment_leaveId_key" ON "LeaveAttachment"("leaveId");

-- CreateIndex
CREATE UNIQUE INDEX "RepReport_clientRef_key" ON "RepReport"("clientRef");

-- CreateIndex
CREATE INDEX "RepReport_organizationId_repId_createdAt_idx" ON "RepReport"("organizationId", "repId", "createdAt");

-- CreateIndex
CREATE INDEX "RepReportTeam_teamId_idx" ON "RepReportTeam"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_clientRef_key" ON "LeaveRequest"("clientRef");

-- AddForeignKey
ALTER TABLE "RepProfile" ADD CONSTRAINT "RepProfile_leaveApproverId_fkey" FOREIGN KEY ("leaveApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveAttachment" ADD CONSTRAINT "LeaveAttachment_leaveId_fkey" FOREIGN KEY ("leaveId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepReport" ADD CONSTRAINT "RepReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepReport" ADD CONSTRAINT "RepReport_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepReportTeam" ADD CONSTRAINT "RepReportTeam_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "RepReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepReportTeam" ADD CONSTRAINT "RepReportTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
