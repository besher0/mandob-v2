import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth.types.js';

// Only tenant-owned custom roles confer company-wide scope; team roles keep their scope.
export async function hasCompanyAccess(
  db: Prisma.TransactionClient,
  user: AuthUser,
  permission: string,
) {
  if (!user.organizationId) return false;
  return !!(await db.user.findFirst({
    where: {
      id: user.id,
      organizationId: user.organizationId,
      status: 'ACTIVE',
      deletedAt: null,
      roles: {
        some: {
          role: {
            OR: [
              {
                code: 'NATIONAL_MANAGER',
                isSystem: true,
                organizationId: null,
              },
              { isSystem: false, organizationId: user.organizationId },
            ],
            permissions: { some: { permission: { code: permission } } },
          },
        },
      },
    },
    select: { id: true },
  }));
}

// These are the supported delegation operations, not operating data.
export const delegatedPermissions = [
  {
    code: 'targets.delete',
    name: 'حذف الأطباء والصيدليات والمشافي',
    requires: ['targets.view', 'areas.view', 'specialties.view'],
  },
  {
    code: 'targets.view',
    name: 'عرض الأطباء والصيدليات والمشافي وتصديرها',
    requires: ['areas.view', 'specialties.view'],
  },
  {
    code: 'targets.manage',
    name: 'إضافة وتعديل واستيراد الأطباء والصيدليات والمشافي',
    requires: ['targets.view', 'areas.view', 'specialties.view'],
  },
  { code: 'areas.view', name: 'عرض المحافظات والمناطق', requires: [] },
  {
    code: 'areas.manage',
    name: 'إضافة وتعديل المحافظات والمناطق',
    requires: ['areas.view', 'areas.manage_own'],
  },
  { code: 'specialties.view', name: 'عرض الاختصاصات', requires: [] },
  {
    code: 'specialties.manage',
    name: 'إضافة وتعديل الاختصاصات',
    requires: ['specialties.view'],
  },
  { code: 'products.view', name: 'عرض الأصناف', requires: [] },
  {
    code: 'products.manage',
    name: 'إضافة وتعديل الأصناف',
    requires: ['products.view'],
  },
  {
    code: 'analytics.view_national',
    name: 'عرض تغطية المحافظات',
    requires: [],
  },
];
export const delegatedCodes = new Set(
  delegatedPermissions.flatMap((p) => [p.code, ...p.requires]),
);
