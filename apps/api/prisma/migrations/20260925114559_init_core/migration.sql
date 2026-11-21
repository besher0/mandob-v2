-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('DOCTOR', 'PHARMACY', 'HOSPITAL');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LeaveDayPart" AS ENUM ('FULL_DAY', 'HALF_DAY');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'APPROVE', 'REJECT', 'ASSIGN', 'UNASSIGN', 'EXPORT');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationSettings" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Damascus',
    "defaultDailyVisitTarget" INTEGER NOT NULL DEFAULT 8,
    "defaultAnnualLeaveDays" DOUBLE PRECISION NOT NULL DEFAULT 12,
    "defaultCycleDays" INTEGER NOT NULL DEFAULT 45,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationWorkingDayRule" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isWorking" BOOLEAN NOT NULL DEFAULT true,
    "workloadFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "startTime" TEXT,
    "endTime" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "OrganizationWorkingDayRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Province" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Province_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Area" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provinceId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "provinceId" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "isManager" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamArea" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamProduct" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamSpecialty" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamSpecialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepProfile" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "employeeCode" TEXT,
    "dailyVisitTarget" INTEGER,
    "hiredAt" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RepProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialty" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldTarget" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "createdById" UUID,
    "type" "TargetType" NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "FieldTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorProfile" (
    "id" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "licenseNumber" TEXT,
    "notes" TEXT,

    CONSTRAINT "DoctorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PharmacyProfile" (
    "id" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "licenseNumber" TEXT,
    "notes" TEXT,

    CONSTRAINT "PharmacyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HospitalProfile" (
    "id" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "notes" TEXT,

    CONSTRAINT "HospitalProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetLocation" (
    "id" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "label" TEXT,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TargetLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetSpecialty" (
    "id" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,

    CONSTRAINT "TargetSpecialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetClass" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TargetClass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "brandName" TEXT,
    "genericName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "startsAt" DATE NOT NULL,
    "endsAt" DATE NOT NULL,
    "status" "CycleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleClassRule" (
    "id" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "targetClassId" UUID NOT NULL,
    "requiredVisits" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CycleClassRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleProvinceClassRule" (
    "id" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "provinceId" UUID NOT NULL,
    "targetClassId" UUID NOT NULL,
    "requiredVisits" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CycleProvinceClassRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleWorkingDayRule" (
    "id" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "isWorking" BOOLEAN NOT NULL DEFAULT true,
    "workloadFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "startTime" TEXT,
    "endTime" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CycleWorkingDayRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleDayOverride" (
    "id" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "isWorking" BOOLEAN NOT NULL,
    "workloadFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CycleDayOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepCycleProfile" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "repId" UUID NOT NULL,
    "dailyVisitTarget" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RepCycleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepCycleTeamPeriod" (
    "id" UUID NOT NULL,
    "repCycleProfileId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "startedAt" DATE NOT NULL,
    "endedAt" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepCycleTeamPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepCycleArea" (
    "id" UUID NOT NULL,
    "repCycleProfileId" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepCycleArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepCycleProduct" (
    "id" UUID NOT NULL,
    "repCycleProfileId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepCycleProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepCycleSpecialty" (
    "id" UUID NOT NULL,
    "repCycleProfileId" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepCycleSpecialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepCycleTarget" (
    "id" UUID NOT NULL,
    "repCycleProfileId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "targetClassId" UUID NOT NULL,
    "requiredVisits" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RepCycleTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldRound" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "repId" UUID NOT NULL,
    "repCycleProfileId" UUID NOT NULL,
    "clientRef" TEXT,
    "status" "RoundStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "startLatitude" DOUBLE PRECISION,
    "startLongitude" DOUBLE PRECISION,
    "endLatitude" DOUBLE PRECISION,
    "endLongitude" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "FieldRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "cycleId" UUID NOT NULL,
    "repId" UUID NOT NULL,
    "repCycleProfileId" UUID NOT NULL,
    "targetId" UUID NOT NULL,
    "roundId" UUID,
    "clientRef" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'PLANNED',
    "plannedFor" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "checkInLatitude" DOUBLE PRECISION,
    "checkInLongitude" DOUBLE PRECISION,
    "checkOutLatitude" DOUBLE PRECISION,
    "checkOutLongitude" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitProduct" (
    "id" UUID NOT NULL,
    "visitId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "reviewerId" UUID,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "dayPart" "LeaveDayPart" NOT NULL DEFAULT 'FULL_DAY',
    "requestedDays" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "allocatedDays" DOUBLE PRECISION NOT NULL,
    "carriedDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "adjustmentDays" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "actorId" UUID,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_code_key" ON "Organization"("code");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE INDEX "Organization_deletedAt_idx" ON "Organization"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationSettings_organizationId_key" ON "OrganizationSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationWorkingDayRule_organizationId_weekday_key" ON "OrganizationWorkingDayRule"("organizationId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_organizationId_status_idx" ON "User"("organizationId", "status");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expiresAt_idx" ON "RefreshToken"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Province_organizationId_idx" ON "Province"("organizationId");

-- CreateIndex
CREATE INDEX "Province_deletedAt_idx" ON "Province"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Province_organizationId_name_key" ON "Province"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Area_organizationId_idx" ON "Area"("organizationId");

-- CreateIndex
CREATE INDEX "Area_provinceId_idx" ON "Area"("provinceId");

-- CreateIndex
CREATE INDEX "Area_deletedAt_idx" ON "Area"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Area_organizationId_provinceId_name_key" ON "Area"("organizationId", "provinceId", "name");

-- CreateIndex
CREATE INDEX "Team_organizationId_isActive_idx" ON "Team"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "Team_provinceId_idx" ON "Team"("provinceId");

-- CreateIndex
CREATE INDEX "Team_deletedAt_idx" ON "Team"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Team_organizationId_name_key" ON "Team"("organizationId", "name");

-- CreateIndex
CREATE INDEX "TeamMember_teamId_endedAt_idx" ON "TeamMember"("teamId", "endedAt");

-- CreateIndex
CREATE INDEX "TeamMember_userId_endedAt_idx" ON "TeamMember"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "TeamArea_areaId_idx" ON "TeamArea"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamArea_teamId_areaId_key" ON "TeamArea"("teamId", "areaId");

-- CreateIndex
CREATE INDEX "TeamProduct_productId_idx" ON "TeamProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamProduct_teamId_productId_key" ON "TeamProduct"("teamId", "productId");

-- CreateIndex
CREATE INDEX "TeamSpecialty_specialtyId_idx" ON "TeamSpecialty"("specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamSpecialty_teamId_specialtyId_key" ON "TeamSpecialty"("teamId", "specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "RepProfile_userId_key" ON "RepProfile"("userId");

-- CreateIndex
CREATE INDEX "RepProfile_organizationId_employeeCode_idx" ON "RepProfile"("organizationId", "employeeCode");

-- CreateIndex
CREATE INDEX "Specialty_organizationId_idx" ON "Specialty"("organizationId");

-- CreateIndex
CREATE INDEX "Specialty_deletedAt_idx" ON "Specialty"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_organizationId_name_key" ON "Specialty"("organizationId", "name");

-- CreateIndex
CREATE INDEX "FieldTarget_organizationId_type_isActive_idx" ON "FieldTarget"("organizationId", "type", "isActive");

-- CreateIndex
CREATE INDEX "FieldTarget_organizationId_name_idx" ON "FieldTarget"("organizationId", "name");

-- CreateIndex
CREATE INDEX "FieldTarget_deletedAt_idx" ON "FieldTarget"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DoctorProfile_targetId_key" ON "DoctorProfile"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "PharmacyProfile_targetId_key" ON "PharmacyProfile"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "HospitalProfile_targetId_key" ON "HospitalProfile"("targetId");

-- CreateIndex
CREATE INDEX "TargetLocation_targetId_idx" ON "TargetLocation"("targetId");

-- CreateIndex
CREATE INDEX "TargetLocation_areaId_isPrimary_idx" ON "TargetLocation"("areaId", "isPrimary");

-- CreateIndex
CREATE INDEX "TargetSpecialty_specialtyId_idx" ON "TargetSpecialty"("specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "TargetSpecialty_targetId_specialtyId_key" ON "TargetSpecialty"("targetId", "specialtyId");

-- CreateIndex
CREATE INDEX "TargetClass_organizationId_rank_idx" ON "TargetClass"("organizationId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "TargetClass_organizationId_code_key" ON "TargetClass"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Product_organizationId_isActive_idx" ON "Product"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Product_organizationId_name_key" ON "Product"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Cycle_organizationId_status_idx" ON "Cycle"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Cycle_organizationId_startsAt_endsAt_idx" ON "Cycle"("organizationId", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cycle_organizationId_name_key" ON "Cycle"("organizationId", "name");

-- CreateIndex
CREATE INDEX "CycleClassRule_targetClassId_idx" ON "CycleClassRule"("targetClassId");

-- CreateIndex
CREATE UNIQUE INDEX "CycleClassRule_cycleId_targetClassId_key" ON "CycleClassRule"("cycleId", "targetClassId");

-- CreateIndex
CREATE INDEX "CycleProvinceClassRule_provinceId_idx" ON "CycleProvinceClassRule"("provinceId");

-- CreateIndex
CREATE INDEX "CycleProvinceClassRule_targetClassId_idx" ON "CycleProvinceClassRule"("targetClassId");

-- CreateIndex
CREATE UNIQUE INDEX "CycleProvinceClassRule_cycleId_provinceId_targetClassId_key" ON "CycleProvinceClassRule"("cycleId", "provinceId", "targetClassId");

-- CreateIndex
CREATE UNIQUE INDEX "CycleWorkingDayRule_cycleId_weekday_key" ON "CycleWorkingDayRule"("cycleId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "CycleDayOverride_cycleId_date_key" ON "CycleDayOverride"("cycleId", "date");

-- CreateIndex
CREATE INDEX "RepCycleProfile_organizationId_cycleId_idx" ON "RepCycleProfile"("organizationId", "cycleId");

-- CreateIndex
CREATE INDEX "RepCycleProfile_repId_isActive_idx" ON "RepCycleProfile"("repId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "RepCycleProfile_cycleId_repId_key" ON "RepCycleProfile"("cycleId", "repId");

-- CreateIndex
CREATE INDEX "RepCycleTeamPeriod_repCycleProfileId_startedAt_idx" ON "RepCycleTeamPeriod"("repCycleProfileId", "startedAt");

-- CreateIndex
CREATE INDEX "RepCycleTeamPeriod_teamId_endedAt_idx" ON "RepCycleTeamPeriod"("teamId", "endedAt");

-- CreateIndex
CREATE INDEX "RepCycleArea_areaId_idx" ON "RepCycleArea"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "RepCycleArea_repCycleProfileId_areaId_key" ON "RepCycleArea"("repCycleProfileId", "areaId");

-- CreateIndex
CREATE INDEX "RepCycleProduct_productId_idx" ON "RepCycleProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "RepCycleProduct_repCycleProfileId_productId_key" ON "RepCycleProduct"("repCycleProfileId", "productId");

-- CreateIndex
CREATE INDEX "RepCycleSpecialty_specialtyId_idx" ON "RepCycleSpecialty"("specialtyId");

-- CreateIndex
CREATE UNIQUE INDEX "RepCycleSpecialty_repCycleProfileId_specialtyId_key" ON "RepCycleSpecialty"("repCycleProfileId", "specialtyId");

-- CreateIndex
CREATE INDEX "RepCycleTarget_targetId_idx" ON "RepCycleTarget"("targetId");

-- CreateIndex
CREATE INDEX "RepCycleTarget_targetClassId_idx" ON "RepCycleTarget"("targetClassId");

-- CreateIndex
CREATE UNIQUE INDEX "RepCycleTarget_repCycleProfileId_targetId_key" ON "RepCycleTarget"("repCycleProfileId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldRound_clientRef_key" ON "FieldRound"("clientRef");

-- CreateIndex
CREATE INDEX "FieldRound_organizationId_status_idx" ON "FieldRound"("organizationId", "status");

-- CreateIndex
CREATE INDEX "FieldRound_cycleId_repId_idx" ON "FieldRound"("cycleId", "repId");

-- CreateIndex
CREATE INDEX "FieldRound_repId_status_idx" ON "FieldRound"("repId", "status");

-- CreateIndex
CREATE INDEX "FieldRound_repId_startedAt_idx" ON "FieldRound"("repId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_clientRef_key" ON "Visit"("clientRef");

-- CreateIndex
CREATE INDEX "Visit_organizationId_completedAt_idx" ON "Visit"("organizationId", "completedAt");

-- CreateIndex
CREATE INDEX "Visit_cycleId_repId_status_idx" ON "Visit"("cycleId", "repId", "status");

-- CreateIndex
CREATE INDEX "Visit_repId_status_plannedFor_idx" ON "Visit"("repId", "status", "plannedFor");

-- CreateIndex
CREATE INDEX "Visit_repId_completedAt_idx" ON "Visit"("repId", "completedAt");

-- CreateIndex
CREATE INDEX "Visit_targetId_completedAt_idx" ON "Visit"("targetId", "completedAt");

-- CreateIndex
CREATE INDEX "Visit_repCycleProfileId_idx" ON "Visit"("repCycleProfileId");

-- CreateIndex
CREATE INDEX "Visit_roundId_idx" ON "Visit"("roundId");

-- CreateIndex
CREATE INDEX "VisitProduct_productId_idx" ON "VisitProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "VisitProduct_visitId_productId_key" ON "VisitProduct"("visitId", "productId");

-- CreateIndex
CREATE INDEX "LeaveRequest_organizationId_status_idx" ON "LeaveRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_requesterId_startsOn_idx" ON "LeaveRequest"("requesterId", "startsOn");

-- CreateIndex
CREATE INDEX "LeaveBalance_organizationId_year_idx" ON "LeaveBalance"("organizationId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_userId_year_key" ON "LeaveBalance"("userId", "year");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationWorkingDayRule" ADD CONSTRAINT "OrganizationWorkingDayRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Province" ADD CONSTRAINT "Province_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Area" ADD CONSTRAINT "Area_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamArea" ADD CONSTRAINT "TeamArea_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamArea" ADD CONSTRAINT "TeamArea_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamProduct" ADD CONSTRAINT "TeamProduct_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamProduct" ADD CONSTRAINT "TeamProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSpecialty" ADD CONSTRAINT "TeamSpecialty_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSpecialty" ADD CONSTRAINT "TeamSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepProfile" ADD CONSTRAINT "RepProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepProfile" ADD CONSTRAINT "RepProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specialty" ADD CONSTRAINT "Specialty_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldTarget" ADD CONSTRAINT "FieldTarget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldTarget" ADD CONSTRAINT "FieldTarget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorProfile" ADD CONSTRAINT "DoctorProfile_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "FieldTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PharmacyProfile" ADD CONSTRAINT "PharmacyProfile_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "FieldTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HospitalProfile" ADD CONSTRAINT "HospitalProfile_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "FieldTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetLocation" ADD CONSTRAINT "TargetLocation_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "FieldTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetLocation" ADD CONSTRAINT "TargetLocation_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetSpecialty" ADD CONSTRAINT "TargetSpecialty_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "FieldTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetSpecialty" ADD CONSTRAINT "TargetSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetClass" ADD CONSTRAINT "TargetClass_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleClassRule" ADD CONSTRAINT "CycleClassRule_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleClassRule" ADD CONSTRAINT "CycleClassRule_targetClassId_fkey" FOREIGN KEY ("targetClassId") REFERENCES "TargetClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleProvinceClassRule" ADD CONSTRAINT "CycleProvinceClassRule_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleProvinceClassRule" ADD CONSTRAINT "CycleProvinceClassRule_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleProvinceClassRule" ADD CONSTRAINT "CycleProvinceClassRule_targetClassId_fkey" FOREIGN KEY ("targetClassId") REFERENCES "TargetClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleWorkingDayRule" ADD CONSTRAINT "CycleWorkingDayRule_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleDayOverride" ADD CONSTRAINT "CycleDayOverride_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleProfile" ADD CONSTRAINT "RepCycleProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleProfile" ADD CONSTRAINT "RepCycleProfile_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleProfile" ADD CONSTRAINT "RepCycleProfile_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleTeamPeriod" ADD CONSTRAINT "RepCycleTeamPeriod_repCycleProfileId_fkey" FOREIGN KEY ("repCycleProfileId") REFERENCES "RepCycleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleTeamPeriod" ADD CONSTRAINT "RepCycleTeamPeriod_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleArea" ADD CONSTRAINT "RepCycleArea_repCycleProfileId_fkey" FOREIGN KEY ("repCycleProfileId") REFERENCES "RepCycleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleArea" ADD CONSTRAINT "RepCycleArea_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "Area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleProduct" ADD CONSTRAINT "RepCycleProduct_repCycleProfileId_fkey" FOREIGN KEY ("repCycleProfileId") REFERENCES "RepCycleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleProduct" ADD CONSTRAINT "RepCycleProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleSpecialty" ADD CONSTRAINT "RepCycleSpecialty_repCycleProfileId_fkey" FOREIGN KEY ("repCycleProfileId") REFERENCES "RepCycleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleSpecialty" ADD CONSTRAINT "RepCycleSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleTarget" ADD CONSTRAINT "RepCycleTarget_repCycleProfileId_fkey" FOREIGN KEY ("repCycleProfileId") REFERENCES "RepCycleProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleTarget" ADD CONSTRAINT "RepCycleTarget_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "FieldTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepCycleTarget" ADD CONSTRAINT "RepCycleTarget_targetClassId_fkey" FOREIGN KEY ("targetClassId") REFERENCES "TargetClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldRound" ADD CONSTRAINT "FieldRound_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldRound" ADD CONSTRAINT "FieldRound_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldRound" ADD CONSTRAINT "FieldRound_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldRound" ADD CONSTRAINT "FieldRound_repCycleProfileId_fkey" FOREIGN KEY ("repCycleProfileId") REFERENCES "RepCycleProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_repId_fkey" FOREIGN KEY ("repId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_repCycleProfileId_fkey" FOREIGN KEY ("repCycleProfileId") REFERENCES "RepCycleProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "FieldTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "FieldRound"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitProduct" ADD CONSTRAINT "VisitProduct_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitProduct" ADD CONSTRAINT "VisitProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
