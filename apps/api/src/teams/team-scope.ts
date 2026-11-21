import type { Prisma } from '../generated/prisma/client.js';

export async function loadTeamScope(
  db: Prisma.TransactionClient,
  profileId: string,
  organizationId: string,
  day: string,
) {
  const date = new Date(`${day}T00:00:00Z`);
  const base = {
    repCycleProfileId: profileId,
    scopeConfigured: true,
    repCycleProfile: { organizationId },
    team: { organizationId },
  };
  const [configuredCount, periods] = await Promise.all([
    db.repCycleTeamPeriod.count({ where: base }),
    db.repCycleTeamPeriod.findMany({
      where: {
        ...base,
        startedAt: { lte: date },
        OR: [{ endedAt: null }, { endedAt: { gte: date } }],
        team: { organizationId, isActive: true, deletedAt: null },
      },
      include: {
        scopeAreas: { where: { area: { organizationId, deletedAt: null } } },
        scopeProducts: {
          where: {
            product: { organizationId, isActive: true, deletedAt: null },
          },
        },
        scopeTargets: {
          include: {
            repCycleTarget: {
              include: {
                target: {
                  include: {
                    locations: {
                      where: { area: { organizationId, deletedAt: null } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
  ]);
  return { configured: configuredCount > 0, periods };
}

export type LoadedTeamScope = Awaited<ReturnType<typeof loadTeamScope>>;

// Never infer attribution by names or by a representative's latest team.
export function creditsForTarget(
  scope: LoadedTeamScope,
  targetId: string,
  selectedAreaIds: string[],
  selectedProductIds: string[],
) {
  return scope.periods.flatMap((period) =>
    period.scopeTargets.flatMap((assignment) => {
      const target = assignment.repCycleTarget.target;
      if (target.id !== targetId || !target.isActive || target.deletedAt)
        return [];
      const inScope = target.locations.some(
        (location) =>
          selectedAreaIds.includes(location.areaId) &&
          period.scopeAreas.some((a) => a.areaId === location.areaId),
      );
      if (!inScope) return [];
      return [
        {
          teamScopeTargetId: assignment.id,
          products: {
            create: period.scopeProducts
              .filter((p) => selectedProductIds.includes(p.productId))
              .map((p) => ({ productId: p.productId })),
          },
        },
      ];
    }),
  );
}
