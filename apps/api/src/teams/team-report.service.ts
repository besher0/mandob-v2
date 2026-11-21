import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { TeamVisitsQueryDto } from './dto/team-assignment.dto.js';

@Injectable()
export class TeamReportService {
  constructor(private readonly prisma: PrismaService) {}

  private async authorize(
    user: AuthUser,
    teamId: string,
    cycleId: string,
    companyPermission: string,
  ) {
    if (!user.organizationId)
      throw new ForbiddenException('الحساب غير مرتبط بشركة.');
    const now = new Date();
    const companyAccess = user.permissions.includes(companyPermission);
    const team = await this.prisma.team.findFirst({
      where: {
        id: teamId,
        organizationId: user.organizationId,
        deletedAt: null,
        ...(companyAccess
          ? {}
          : {
              members: {
                some: {
                  userId: user.id,
                  isManager: true,
                  startedAt: { lte: now },
                  OR: [{ endedAt: null }, { endedAt: { gt: now } }],
                },
              },
            }),
      },
      select: { id: true, name: true, provinceId: true },
    });
    const cycle = await this.prisma.cycle.findFirst({
      where: { id: cycleId, organizationId: user.organizationId },
      select: { id: true },
    });
    if (!team || !cycle)
      throw new ForbiddenException('الفريق أو السايكل خارج نطاقك.');
    return { team, organizationId: user.organizationId };
  }

  async coverage(user: AuthUser, teamId: string, cycleId: string) {
    if (
      !user.permissions.includes('analytics.view_team') &&
      !user.permissions.includes('analytics.view_national')
    )
      throw new ForbiddenException();
    const { team, organizationId } = await this.authorize(
      user,
      teamId,
      cycleId,
      'analytics.view_national',
    );
    const periodWhere = {
      teamId,
      scopeConfigured: true,
      team: { organizationId },
      repCycleProfile: { organizationId, cycleId },
    };
    const assignments = await this.prisma.teamScopeTarget.findMany({
      where: { teamPeriod: periodWhere },
      include: {
        repCycleTarget: {
          include: {
            target: { select: { id: true, name: true } },
            repCycleProfile: {
              select: { repId: true, rep: { select: { name: true } } },
            },
          },
        },
        _count: {
          select: {
            credits: {
              where: {
                visit: { organizationId, cycleId, status: 'COMPLETED' },
              },
            },
          },
        },
      },
    });
    // Several consecutive periods for the same team do not multiply the cycle target.
    const targets = new Map<
      string,
      {
        targetId: string;
        name: string;
        repId: string;
        repName: string;
        requiredVisits: number;
        completedVisits: number;
      }
    >();
    for (const a of assignments) {
      const row = targets.get(a.repCycleTargetId) ?? {
        targetId: a.repCycleTarget.targetId,
        name: a.repCycleTarget.target.name,
        repId: a.repCycleTarget.repCycleProfile.repId,
        repName: a.repCycleTarget.repCycleProfile.rep.name,
        requiredVisits: 0,
        completedVisits: 0,
      };
      row.requiredVisits = Math.max(row.requiredVisits, a.requiredVisits);
      row.completedVisits += a._count.credits;
      targets.set(a.repCycleTargetId, row);
    }
    const items = [...targets.values()];
    const requiredVisits = items.reduce((sum, a) => sum + a.requiredVisits, 0);
    const creditedVisits = items.reduce(
      (sum, a) => sum + Math.min(a.requiredVisits, a.completedVisits),
      0,
    );
    return {
      team,
      requiredVisits,
      creditedVisits,
      coveragePercent: requiredVisits
        ? Math.round((creditedVisits / requiredVisits) * 1000) / 10
        : 0,
      targets: items,
      unconfiguredPeriods: await this.prisma.repCycleTeamPeriod.count({
        where: { ...periodWhere, scopeConfigured: false },
      }),
    };
  }

  async visits(
    user: AuthUser,
    teamId: string,
    cycleId: string,
    query: TeamVisitsQueryDto,
  ) {
    if (
      !user.permissions.includes('visits.view_team') &&
      !user.permissions.includes('visits.view_all')
    )
      throw new ForbiddenException();
    const { organizationId } = await this.authorize(
      user,
      teamId,
      cycleId,
      'visits.view_all',
    );
    const where = {
      teamScopeTarget: {
        teamPeriod: { teamId, repCycleProfile: { organizationId, cycleId } },
      },
      visit: { organizationId, cycleId, status: 'COMPLETED' as const },
    };
    if (
      query.cursor &&
      !(await this.prisma.visitTeamCredit.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true },
      }))
    )
      throw new NotFoundException('مؤشر الصفحة غير صالح.');
    const rows = await this.prisma.visitTeamCredit.findMany({
      where,
      orderBy: [{ visit: { completedAt: 'desc' } }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        visit: {
          select: {
            id: true,
            roundId: true,
            completedAt: true,
            rep: { select: { id: true, name: true } },
            target: { select: { id: true, name: true } },
          },
        },
        products: { select: { product: { select: { id: true, name: true } } } },
      },
    });
    const items = rows
      .slice(0, query.limit)
      .map((row) => ({
        creditId: row.id,
        ...row.visit,
        products: row.products.map((p) => p.product),
      }));
    return {
      items,
      nextCursor: rows.length > query.limit ? items.at(-1)!.creditId : null,
    };
  }

  async companySummary(user: AuthUser, cycleId: string) {
    if (
      !user.organizationId ||
      !user.permissions.includes('analytics.view_national')
    )
      throw new ForbiddenException();
    const organizationId = user.organizationId;
    if (
      !(await this.prisma.cycle.findFirst({
        where: { id: cycleId, organizationId },
        select: { id: true },
      }))
    )
      throw new ForbiddenException('السايكل خارج شركتك.');
    const where = { organizationId, cycleId, status: 'COMPLETED' as const };
    const [physicalVisits, allocatedVisits, teamCredits] = await Promise.all([
      this.prisma.visit.count({ where }),
      this.prisma.visit.count({
        where: { ...where, teamCredits: { some: {} } },
      }),
      this.prisma.visitTeamCredit.count({
        where: {
          visit: where,
          teamScopeTarget: { teamPeriod: { team: { organizationId } } },
        },
      }),
    ]);
    return {
      cycleId,
      physicalVisits,
      allocatedVisits,
      unallocatedVisits: physicalVisits - allocatedVisits,
      teamCredits,
    };
  }
}
