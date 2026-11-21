ALTER TABLE "OrganizationSettings" ADD COLUMN "roundEditWindowHours" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FieldRound" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "FieldRound" ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "FieldRound" r SET "createdAt"=COALESCE((SELECT min(a."createdAt") FROM "AuditLog" a WHERE a."entityType"='FieldRound' AND a."entityId"=r."id"::text AND a."action"='CREATE'),r."startedAt");
