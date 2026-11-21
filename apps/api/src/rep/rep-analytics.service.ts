import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import { dateInZone } from './rep-workspace.service.js';
import { loadTeamScope, creditsForTarget } from '../teams/team-scope.js';
import { AnalyticsQueryDto } from './dto/analytics-query.dto.js';

const dayMs = 86400000;
const day = (value: Date) => value.toISOString().slice(0, 10);
export function analysisWindow(
  startsOn: string,
  endsOn: string,
  today: string,
  period: AnalyticsQueryDto['period'],
) {
  const to = today < endsOn ? today : endsOn;
  const date = new Date(`${to}T00:00:00Z`);
  // Calendar week begins Monday; cycle requirements remain unchanged by the period filter.
  if (period === 'week')
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  else if (period === 'month') date.setUTCDate(1);
  const from =
    period === 'cycle' ? startsOn : day(date) > startsOn ? day(date) : startsOn;
  return { from, to };
}
type ProgressItem = {
  completedVisits: number;
  requiredVisits: number;
  class: { code: string };
};
export function analysisTotals(items: ProgressItem[]) {
  const required = items.reduce((sum, t) => sum + t.requiredVisits, 0);
  const credited = items.reduce(
    (sum, t) => sum + Math.min(t.completedVisits, t.requiredVisits),
    0,
  );
  const complete = items.filter(
    (t) => t.completedVisits >= t.requiredVisits,
  ).length;
  return {
    total: items.length,
    complete,
    behind: items.filter(
      (t) => t.completedVisits > 0 && t.completedVisits < t.requiredVisits,
    ).length,
    unvisited: items.filter((t) => t.completedVisits === 0).length,
    compliance: items.length
      ? Math.round(
          (items.reduce(
            (sum, t) =>
              sum +
              (t.requiredVisits > 0
                ? Math.min(1, t.completedVisits / t.requiredVisits)
                : 1),
            0,
          ) /
            items.length) *
            100,
        )
      : 0,
    coverage: required ? Math.round((credited / required) * 100) : 0,
    aVisits: items
      .filter((t) => t.class.code === 'A')
      .reduce((sum, t) => sum + t.completedVisits, 0),
    aCount: items.filter((t) => t.class.code === 'A').length,
  };
}
@Injectable()
export class RepAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}
  private async load(
    user: AuthUser,
    profileId: string,
    query: AnalyticsQueryDto,
  ) {
    const profile = await this.prisma.repCycleProfile.findFirst({
      where: {
        id: profileId,
        repId: user.id,
        organizationId: user.organizationId!,
      },
      include: { cycle: true },
    });
    if (!profile) throw new ForbiddenException('لا يمكنك عرض هذا السايكل.');
    const today = dateInZone(new Date(), profile.cycle.timezone);
    const range = analysisWindow(
      day(profile.cycle.startsAt),
      day(profile.cycle.endsAt),
      today,
      query.period,
    );
    const scope = await loadTeamScope(
      this.prisma,
      profile.id,
      user.organizationId!,
      range.to,
    );
    const [assignments, assignedAreas, assignedProducts, visits] =
      await Promise.all([
        this.prisma.repCycleTarget.findMany({
          where: {
            repCycleProfileId: profile.id,
            target: {
              organizationId: user.organizationId!,
              deletedAt: null,
              isActive: true,
            },
          },
          include: {
            targetClass: true,
            target: {
              include: {
                locations: {
                  where: {
                    area: {
                      organizationId: user.organizationId!,
                      deletedAt: null,
                    },
                  },
                  include: { area: true },
                },
                specialties: {
                  where: {
                    specialty: {
                      organizationId: user.organizationId!,
                      deletedAt: null,
                    },
                  },
                  include: { specialty: true },
                },
              },
            },
          },
          orderBy: { target: { name: 'asc' } },
        }),
        this.prisma.repCycleArea.findMany({
          where: {
            repCycleProfileId: profile.id,
            area: { organizationId: user.organizationId!, deletedAt: null },
          },
          include: { area: true },
        }),
        this.prisma.repCycleProduct.findMany({
          where: {
            repCycleProfileId: profile.id,
            product: {
              organizationId: user.organizationId!,
              isActive: true,
              deletedAt: null,
            },
          },
          include: { product: true },
        }),
        this.prisma.visit.findMany({
          where: {
            organizationId: user.organizationId!,
            repId: user.id,
            repCycleProfileId: profile.id,
            status: 'COMPLETED',
            completedAt: {
              gte: new Date(
                new Date(`${range.from}T00:00:00Z`).getTime() - dayMs,
              ),
              lt: new Date(
                new Date(`${range.to}T00:00:00Z`).getTime() + 2 * dayMs,
              ),
            },
          },
          select: {
            id: true,
            targetId: true,
            completedAt: true,
            products: { select: { productId: true } },
          },
        }),
      ]);
    const scopedAreaIds = new Set(
      scope.periods.flatMap((p) => p.scopeAreas.map((a) => a.areaId)),
    );
    const scopedProductIds = new Set(
      scope.periods.flatMap((p) => p.scopeProducts.map((a) => a.productId)),
    );
    const areas = assignedAreas
      .filter((a) => !scope.configured || scopedAreaIds.has(a.areaId))
      .map((a) => ({ id: a.areaId, name: a.area.name }));
    const areaIds = new Set(areas.map((a) => a.id));
    const allowedAssignments = assignments.filter(
      (a) =>
        (!scope.configured ||
          creditsForTarget(scope, a.targetId, [...areaIds], []).length > 0) &&
        (!query.classId || a.targetClassId === query.classId) &&
        (!query.areaId ||
          (areaIds.has(query.areaId) &&
            a.target.locations.some((l) => l.areaId === query.areaId))),
    );
    const targetIds = new Set(allowedAssignments.map((a) => a.targetId));
    const periodVisits = visits.filter((v) => {
      const d = dateInZone(v.completedAt!, profile.cycle.timezone);
      return d >= range.from && d <= range.to && targetIds.has(v.targetId);
    });
    const counts = new Map<string, { done: number; last: string }>();
    const promotions = new Map<string, number>();
    for (const v of periodVisits) {
      const d = dateInZone(v.completedAt!, profile.cycle.timezone),
        old = counts.get(v.targetId);
      counts.set(v.targetId, {
        done: (old?.done ?? 0) + 1,
        last: old && old.last > d ? old.last : d,
      });
      for (const p of v.products)
        promotions.set(p.productId, (promotions.get(p.productId) ?? 0) + 1);
    }
    const doctors = allowedAssignments
      .filter((a) => a.target.type === 'DOCTOR')
      .map((a) => {
        const count = counts.get(a.targetId),
          done = count?.done ?? 0;
        return {
          id: a.targetId,
          name: a.target.name,
          type: 'DOCTOR' as const,
          kind: null,
          affiliation: null,
          class: {
            id: a.targetClassId,
            name: a.targetClass.name,
            code: a.targetClass.code,
          },
          specialties: a.target.specialties.map((s) => ({
            id: s.specialtyId,
            name: s.specialty.name,
          })),
          locations: a.target.locations
            .filter((l) => areaIds.has(l.areaId))
            .map((l) => ({
              id: l.id,
              areaId: l.areaId,
              areaName: l.area.name,
              address: l.address,
            })),
          completedVisits: done,
          requiredVisits: a.requiredVisits,
          progress: a.requiredVisits
            ? Math.min(100, Math.round((done / a.requiredVisits) * 100))
            : 100,
          lastVisit: count?.last ?? null,
          status:
            done === 0
              ? 'غير مزار'
              : done >= a.requiredVisits
                ? 'مكتمل'
                : 'ناقص',
        };
      });
    const areaStats = areas
      .filter((a) => !query.areaId || query.areaId === a.id)
      .map((a) => ({
        ...a,
        ...analysisTotals(
          doctors.filter((t) => t.locations.some((l) => l.areaId === a.id)),
        ),
      }))
      .sort(
        (a, b) => a.coverage - b.coverage || a.name.localeCompare(b.name, 'ar'),
      );
    const products = assignedProducts
      .filter((p) => !scope.configured || scopedProductIds.has(p.productId))
      .map((p) => ({
        id: p.productId,
        name: p.product.name,
        guidance: p.guidance,
        count: promotions.get(p.productId) ?? 0,
        target: null,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ar'));
    const needsVisit = doctors.filter(
      (d) => d.completedVisits === 0 || d.completedVisits < d.requiredVisits,
    );
    const aDoctors = doctors.filter((d) => d.class.code === 'A');
    const summary = analysisTotals(doctors);
    const kpis = {
      frequency: [
        { label: 'الالتزام', value: `${summary.compliance}%` },
        { label: 'مكتمل', value: summary.complete },
        { label: 'ناقص', value: summary.behind },
      ],
      unvisited: [
        { label: 'بحاجة زيارة', value: needsVisit.length },
        {
          label: 'منهم A',
          value: needsVisit.filter((d) => d.class.code === 'A').length,
        },
        {
          label: 'المناطق',
          value: new Set(
            needsVisit.flatMap((d) => d.locations.map((l) => l.areaId)),
          ).size,
        },
      ],
      coverage: [
        {
          label: 'متوسط التغطية',
          value: `${areaStats.length ? Math.round(areaStats.reduce((n, a) => n + a.coverage, 0) / areaStats.length) : 0}%`,
        },
        {
          label: 'أقل من 50%',
          value: areaStats.filter((a) => a.coverage < 50).length,
        },
        {
          label: 'أكثر من 70%',
          value: areaStats.filter((a) => a.coverage >= 70).length,
        },
      ],
      aDoctors: [
        { label: 'إجمالي A', value: aDoctors.length },
        {
          label: 'مكتمل',
          value: aDoctors.filter((d) => d.completedVisits >= d.requiredVisits)
            .length,
        },
        {
          label: 'غير مزار',
          value: aDoctors.filter((d) => d.completedVisits === 0).length,
        },
      ],
      products: [
        {
          label: 'إجمالي الترويجات',
          value: products.reduce((n, p) => n + p.count, 0),
        },
        { label: 'الأعلى', value: products[0]?.count ? products[0].name : '—' },
        { label: 'أصناف فعالة', value: products.length },
      ],
    };
    return {
      kpis,
      needsVisit,
      aDoctors,
      cycle: { id: profile.cycleId, name: profile.cycle.name },
      range,
      doctors,
      areas: areaStats,
      products,
      summary,
    };
  }
  async analytics(user: AuthUser, query: AnalyticsQueryDto) {
    if (!user.organizationId)
      throw new ForbiddenException('الحساب غير مرتبط بشركة.');
    const profiles = await this.prisma.repCycleProfile.findMany({
      where: {
        organizationId: user.organizationId,
        repId: user.id,
        cycle: { status: 'ACTIVE' },
        isActive: true,
      },
      include: { cycle: true },
      orderBy: { cycle: { startsAt: 'desc' } },
    });
    const active = profiles.find((p) => {
      const today = dateInZone(new Date(), p.cycle.timezone);
      return day(p.cycle.startsAt) <= today && day(p.cycle.endsAt) >= today;
    });
    if (!active)
      return { current: null, previous: null, comparison: [], overview: null };
    const prior = await this.prisma.repCycleProfile.findFirst({
      where: {
        organizationId: user.organizationId,
        repId: user.id,
        cycle: {
          status: { in: ['CLOSED', 'ARCHIVED', 'ACTIVE'] },
          endsAt: { lt: active.cycle.startsAt },
        },
      },
      include: { cycle: true },
      orderBy: { cycle: { endsAt: 'desc' } },
    });
    const [current, previous] = await Promise.all([
      this.load(user, active.id, query),
      prior ? this.load(user, prior.id, query) : Promise.resolve(null),
    ]);
    const comparison = previous
      ? (
          [
            ['coverage', 'تغطية السايكل', '%'],
            ['compliance', 'التزام Frequency', '%'],
            ['unvisited', 'الأطباء غير المزارين', ''],
            ['aVisits', 'زيارات أطباء A', ''],
          ] as const
        ).map(([key, label, unit]) => ({
          key,
          label,
          unit,
          current: current.summary[key],
          previous: previous.summary[key],
          delta: current.summary[key] - previous.summary[key],
          improved:
            key === 'unvisited'
              ? current.summary[key] < previous.summary[key]
              : current.summary[key] > previous.summary[key],
        }))
      : [];
    return {
      current,
      previous: previous
        ? { cycle: previous.cycle, range: previous.range }
        : null,
      comparison,
      overview: {
        compliance: current.summary.compliance,
        unvisited: current.summary.unvisited,
        unvisitedA: current.doctors.filter(
          (d) => d.class.code === 'A' && !d.completedVisits,
        ).length,
        areaCoverage: current.areas.length
          ? Math.round(
              current.areas.reduce((n, a) => n + a.coverage, 0) /
                current.areas.length,
            )
          : 0,
      },
    };
  }
}
