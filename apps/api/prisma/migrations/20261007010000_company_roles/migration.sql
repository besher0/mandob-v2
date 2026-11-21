ALTER TABLE "Role" ADD COLUMN "organizationId" UUID, ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Role_organizationId_idx" ON "Role"("organizationId");
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
INSERT INTO "Role" ("id", "code", "name", "isSystem", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'COMPANY_STAFF', 'موظف شركة', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT ("code") DO NOTHING;
