-- Narrow permissions: services additionally require current manager membership.
INSERT INTO "Permission" ("id", "code", "name", "createdAt") VALUES
('57a4d451-4c68-497a-bc98-1b261df0a981', 'teams.configure_own', 'تعديل الفرق المدارة', CURRENT_TIMESTAMP),
('bbe1f108-af38-4076-ae4a-b18b94b72765', 'teams.assign_own', 'إدارة تكليفات الفرق المدارة', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "RolePermission" ("id", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), r."id", p."id", CURRENT_TIMESTAMP
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."isSystem" = true AND r."code" IN ('TEAM_MANAGER', 'NATIONAL_MANAGER', 'SUPER_ADMIN')
AND p."code" IN ('teams.configure_own', 'teams.assign_own')
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
