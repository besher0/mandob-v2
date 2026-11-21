ALTER TABLE "FieldTarget" ADD COLUMN "targetClassId" UUID;
ALTER TABLE "FieldTarget" ADD CONSTRAINT "FieldTarget_targetClassId_fkey" FOREIGN KEY ("targetClassId") REFERENCES "TargetClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Preserve only unambiguous existing classifications; never guess conflicting assignments.
UPDATE "FieldTarget" f SET "targetClassId" = x.class_id::uuid
FROM (SELECT r."targetId", min(r."targetClassId"::text) class_id FROM "RepCycleTarget" r
JOIN "RepCycleProfile" p ON p.id=r."repCycleProfileId"
JOIN "FieldTarget" t ON t.id=r."targetId" AND t."organizationId"=p."organizationId"
JOIN "TargetClass" c ON c.id=r."targetClassId" AND c."organizationId"=t."organizationId"
GROUP BY r."targetId" HAVING count(DISTINCT r."targetClassId")=1) x WHERE f.id=x."targetId";
INSERT INTO "Permission" (id,code,name,"createdAt") VALUES ('522721c4-ad8f-41db-a847-51214c820dc0','users.manage_own','إدارة مندوبي الفرق المدارة',CURRENT_TIMESTAMP) ON CONFLICT(code) DO NOTHING;
INSERT INTO "RolePermission" (id,"roleId","permissionId","createdAt") SELECT gen_random_uuid(),r.id,p.id,CURRENT_TIMESTAMP FROM "Role" r CROSS JOIN "Permission" p WHERE r."isSystem"=true AND r.code IN ('TEAM_MANAGER','NATIONAL_MANAGER','SUPER_ADMIN') AND p.code='users.manage_own' ON CONFLICT("roleId","permissionId") DO NOTHING;
