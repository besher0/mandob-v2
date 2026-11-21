ALTER TABLE "OrganizationSettings" ADD COLUMN "roundLocationPolicy" TEXT NOT NULL DEFAULT 'DISABLED';
ALTER TABLE "FieldRound" ADD COLUMN "registrationLocation" JSONB;
