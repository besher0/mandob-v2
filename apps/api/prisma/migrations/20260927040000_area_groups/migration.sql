CREATE TABLE "AreaGroup" ("id" UUID NOT NULL, "provinceId" UUID NOT NULL, "name" TEXT NOT NULL, "sortOrder" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "AreaGroup_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AreaGroup_provinceId_name_key" ON "AreaGroup"("provinceId","name");
ALTER TABLE "AreaGroup" ADD CONSTRAINT "AreaGroup_provinceId_fkey" FOREIGN KEY ("provinceId") REFERENCES "Province"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Area" ADD COLUMN "groupId" UUID;
CREATE INDEX "Area_groupId_idx" ON "Area"("groupId");
ALTER TABLE "Area" ADD CONSTRAINT "Area_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "AreaGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
INSERT INTO "Permission" ("id","code","name","createdAt") VALUES (gen_random_uuid(),'areas.manage_own','إدارة مناطق المحافظات المسندة',CURRENT_TIMESTAMP) ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("id","roleId","permissionId","createdAt") SELECT gen_random_uuid(),r."id",p."id",CURRENT_TIMESTAMP FROM "Role" r CROSS JOIN "Permission" p WHERE r."isSystem"=true AND r."code" IN ('TEAM_MANAGER','NATIONAL_MANAGER','SUPER_ADMIN') AND p."code"='areas.manage_own' ON CONFLICT ("roleId","permissionId") DO NOTHING;
