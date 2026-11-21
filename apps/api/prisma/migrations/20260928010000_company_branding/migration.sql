ALTER TABLE "OrganizationSettings" ADD COLUMN "branding" JSONB, ADD COLUMN "brandingRevision" INTEGER NOT NULL DEFAULT 0;
