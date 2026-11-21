import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';

type RepContext = {
  now: Date;
  today: Date;
  cycle: any | null;
  repCycle: any | null;
};

@Injectable()
export class RepDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async dashboard(user: AuthUser) {
    const context = await this.getContext(user);

    if (!context.cycle || !context.repCycle) {
      return this.emptyDashboard(context);
    }

    const [cycleProgress, weeklySummary, overdueDoctors, activeRound] =
      await Promise.all([
        this.cycleProgressFromContext(context),
        this.weeklySummaryFromContext(context),
        this.overdueDoctorsFromContext(context, 5),
        this.prisma.fieldRound.findFirst({
          where: {
            repId: user.id,
            status: 'ACTIVE',
          },
          orderBy: {
            startedAt: 'desc',
          },
          select: {
            id: true,
            startedAt: true,
          },
        }),
      ]);

    const latestTeamPeriod = context.repCycle.teamPeriods[0] ?? null;
    const activeTeams = await this.prisma.repCycleTeamPeriod.findMany({
      where: {
        repCycleProfileId: context.repCycle.id,
        startedAt: { lte: context.today },
        OR: [{ endedAt: null }, { endedAt: { gte: context.today } }],
        team: {
          organizationId: user.organizationId!,
          isActive: true,
          deletedAt: null,
        },
      },
      select: { team: { select: { id: true, name: true } } },
      orderBy: { team: { name: 'asc' } },
    });

    return {
      cycle: {
        id: context.cycle.id,
        name: context.cycle.name,
        startsAt: context.cycle.startsAt,
        endsAt: context.cycle.endsAt,
        status: context.cycle.status,
      },
      rep: {
        id: user.id,
        name: user.name,
        dailyVisitTarget: context.repCycle.dailyVisitTarget,
        teams: [
          ...new Map(activeTeams.map((p) => [p.team.id, p.team])).values(),
        ],
        team: latestTeamPeriod
          ? {
              id: latestTeamPeriod.team.id,
              name: latestTeamPeriod.team.name,
            }
          : null,
      },
      activeRound,
      cycleProgress,
      weeklySummary,
      overdueDoctors,
    };
  }

  async cycleProgress(user: AuthUser) {
    const context = await this.getContext(user);
    return this.cycleProgressFromContext(context);
  }

  async weeklySummary(user: AuthUser) {
    const context = await this.getContext(user);
    return this.weeklySummaryFromContext(context);
  }

  async overdueDoctors(user: AuthUser, limit: number) {
    const context = await this.getContext(user);
    return this.overdueDoctorsFromContext(context, limit);
  }

  private async getContext(user: AuthUser): Promise<RepContext> {
    if (!user.organizationId) {
      throw new ForbiddenException(
        'This account is not assigned to an organization.',
      );
    }

    const now = new Date();

    const cycle = await this.prisma.cycle.findFirst({
      where: {
        organizationId: user.organizationId,
        status: 'ACTIVE',
        startsAt: { lte: now },
        endsAt: { gte: now },
      },
      orderBy: {
        startsAt: 'desc',
      },
      include: {
        workingDays: true,
        dayOverrides: true,
        organization: {
          include: {
            defaultWorkingDays: true,
          },
        },
      },
    });

    if (!cycle) {
      return {
        now,
        today: this.toDateOnlyInTimeZone(now, 'Asia/Damascus'),
        cycle: null,
        repCycle: null,
      };
    }

    const repCycle = await this.prisma.repCycleProfile.findUnique({
      where: {
        cycleId_repId: {
          cycleId: cycle.id,
          repId: user.id,
        },
      },
      include: {
        teamPeriods: {
          where: {
            OR: [{ endedAt: null }, { endedAt: { gte: cycle.startsAt } }],
          },
          orderBy: {
            startedAt: 'desc',
          },
          take: 1,
          include: {
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return {
      now,
      today: this.toDateOnlyInTimeZone(now, cycle.timezone),
      cycle,
      repCycle,
    };
  }

  private async cycleProgressFromContext(context: RepContext) {
    if (!context.cycle || !context.repCycle) {
      return {
        hasActiveCycle: false,
        totalTargets: 0,
        completedTargets: 0,
        requiredVisits: 0,
        creditedVisits: 0,
        actualCompletedVisits: 0,
        coveragePercent: 0,
        elapsedPercent: 0,
      };
    }

    const targets = await this.prisma.repCycleTarget.findMany({
      where: {
        repCycleProfileId: context.repCycle.id,
      },
      select: {
        targetId: true,
        requiredVisits: true,
      },
    });

    if (targets.length === 0) {
      return {
        hasActiveCycle: true,
        totalTargets: 0,
        completedTargets: 0,
        requiredVisits: 0,
        creditedVisits: 0,
        actualCompletedVisits: 0,
        coveragePercent: 0,
        elapsedPercent: this.getElapsedPercent(context),
      };
    }

    const targetIds = targets.map((item) => item.targetId);

    const completedByTarget = await this.prisma.visit.groupBy({
      by: ['targetId'],
      where: {
        repCycleProfileId: context.repCycle.id,
        targetId: { in: targetIds },
        status: 'COMPLETED',
        completedAt: {
          gte: context.cycle.startsAt,
          lte: context.cycle.endsAt,
        },
      },
      _count: {
        _all: true,
      },
    });

    const visitCounts = new Map(
      completedByTarget.map((row) => [row.targetId, row._count._all]),
    );

    let requiredVisits = 0;
    let creditedVisits = 0;
    let actualCompletedVisits = 0;
    let completedTargets = 0;

    for (const target of targets) {
      const completed = visitCounts.get(target.targetId) ?? 0;
      requiredVisits += target.requiredVisits;
      actualCompletedVisits += completed;
      creditedVisits += Math.min(completed, target.requiredVisits);

      if (completed >= target.requiredVisits) {
        completedTargets += 1;
      }
    }

    const coveragePercent =
      requiredVisits === 0
        ? 0
        : Number(((creditedVisits / requiredVisits) * 100).toFixed(1));

    return {
      hasActiveCycle: true,
      totalTargets: targets.length,
      completedTargets,
      requiredVisits,
      creditedVisits,
      actualCompletedVisits,
      coveragePercent,
      elapsedPercent: this.getElapsedPercent(context),
    };
  }

  private async weeklySummaryFromContext(context: RepContext) {
    if (!context.repCycle) {
      return {
        range: null,
        completedVisits: 0,
        dailyVisitTarget: 0,
        workingDayTarget: 0,
        targetAchievementPercent: 0,
        days: [],
      };
    }

    const end = context.today;
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);

    const queryEnd = new Date(end);
    queryEnd.setUTCDate(queryEnd.getUTCDate() + 1);

    const visits = await this.prisma.visit.findMany({
      where: {
        repCycleProfileId: context.repCycle.id,
        status: 'COMPLETED',
        completedAt: {
          gte: start,
          lt: queryEnd,
        },
      },
      select: {
        completedAt: true,
      },
      orderBy: {
        completedAt: 'asc',
      },
    });

    const counts = new Map<string, number>();

    for (const visit of visits) {
      if (!visit.completedAt) continue;

      const dateKey = this.formatDate(
        this.toDateOnlyInTimeZone(
          visit.completedAt,
          context.cycle?.timezone ?? 'Asia/Damascus',
        ),
      );

      counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
    }

    const days: Array<{
      date: string;
      completedVisits: number;
      target: number;
      isWorkingDay: boolean;
    }> = [];

    let workingDayTarget = 0;

    for (
      let cursor = new Date(start);
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const date = new Date(cursor);
      const weight = this.getWorkingWeight(context, date);
      const target = Number(
        (context.repCycle.dailyVisitTarget * weight).toFixed(2),
      );

      workingDayTarget += target;

      const dateKey = this.formatDate(date);

      days.push({
        date: dateKey,
        completedVisits: counts.get(dateKey) ?? 0,
        target,
        isWorkingDay: weight > 0,
      });
    }

    const completedVisits = visits.length;
    const targetAchievementPercent =
      workingDayTarget === 0
        ? 0
        : Number(
            Math.min(999, (completedVisits / workingDayTarget) * 100).toFixed(
              1,
            ),
          );

    return {
      range: {
        from: this.formatDate(start),
        to: this.formatDate(end),
      },
      completedVisits,
      dailyVisitTarget: context.repCycle.dailyVisitTarget,
      workingDayTarget,
      targetAchievementPercent,
      days,
    };
  }

  private async overdueDoctorsFromContext(context: RepContext, limit: number) {
    if (!context.cycle || !context.repCycle) {
      return {
        total: 0,
        items: [],
      };
    }

    const elapsedRatio = this.getElapsedRatio(context);

    const assignments = await this.prisma.repCycleTarget.findMany({
      where: {
        repCycleProfileId: context.repCycle.id,
        target: {
          type: 'DOCTOR',
          isActive: true,
          deletedAt: null,
        },
      },
      include: {
        targetClass: {
          select: {
            code: true,
            name: true,
          },
        },
        target: {
          select: {
            id: true,
            name: true,
            phone: true,
            locations: {
              orderBy: {
                isPrimary: 'desc',
              },
              take: 1,
              select: {
                address: true,
                area: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
            specialties: {
              take: 3,
              include: {
                specialty: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (assignments.length === 0) {
      return {
        total: 0,
        items: [],
      };
    }

    const targetIds = assignments.map((assignment) => assignment.targetId);

    const completedByTarget = await this.prisma.visit.groupBy({
      by: ['targetId'],
      where: {
        repCycleProfileId: context.repCycle.id,
        targetId: {
          in: targetIds,
        },
        status: 'COMPLETED',
        completedAt: {
          gte: context.cycle.startsAt,
          lte: context.cycle.endsAt,
        },
      },
      _count: {
        _all: true,
      },
    });

    const counts = new Map(
      completedByTarget.map((row) => [row.targetId, row._count._all]),
    );

    const overdue = assignments
      .map((assignment) => {
        const completedVisits = counts.get(assignment.targetId) ?? 0;

        const expectedVisits = Math.min(
          assignment.requiredVisits,
          Math.floor(assignment.requiredVisits * elapsedRatio + 1e-9),
        );

        const behindBy = Math.max(0, expectedVisits - completedVisits);

        return {
          targetId: assignment.target.id,
          name: assignment.target.name,
          phone: assignment.target.phone,
          class: {
            code: assignment.targetClass.code,
            name: assignment.targetClass.name,
          },
          area: assignment.target.locations[0]?.area ?? null,
          address: assignment.target.locations[0]?.address ?? null,
          specialties: assignment.target.specialties.map(
            (item) => item.specialty,
          ),
          requiredVisits: assignment.requiredVisits,
          completedVisits,
          expectedVisits,
          behindBy,
        };
      })
      .filter((item) => item.behindBy > 0)
      .sort((a, b) => {
        if (b.behindBy !== a.behindBy) {
          return b.behindBy - a.behindBy;
        }

        return a.name.localeCompare(b.name, 'ar');
      });

    return {
      total: overdue.length,
      items: overdue.slice(0, limit),
    };
  }

  private emptyDashboard(context: RepContext) {
    return {
      cycle: null,
      rep: null,
      activeRound: null,
      cycleProgress: {
        hasActiveCycle: false,
        totalTargets: 0,
        completedTargets: 0,
        requiredVisits: 0,
        creditedVisits: 0,
        actualCompletedVisits: 0,
        coveragePercent: 0,
        elapsedPercent: 0,
      },
      weeklySummary: {
        range: null,
        completedVisits: 0,
        dailyVisitTarget: 0,
        workingDayTarget: 0,
        targetAchievementPercent: 0,
        days: [],
      },
      overdueDoctors: {
        total: 0,
        items: [],
      },
      meta: {
        message:
          context.cycle === null
            ? 'No active cycle.'
            : 'The representative is not assigned to the active cycle.',
      },
    };
  }

  private getElapsedPercent(context: RepContext) {
    return Number((this.getElapsedRatio(context) * 100).toFixed(1));
  }

  private getElapsedRatio(context: RepContext) {
    if (!context.cycle) return 0;

    const start = this.toDateOnly(context.cycle.startsAt);
    const end = this.toDateOnly(context.cycle.endsAt);
    const today = this.clampDate(context.today, start, end);

    let totalWeight = 0;
    let elapsedWeight = 0;

    for (
      let cursor = new Date(start);
      cursor <= end;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      const date = new Date(cursor);
      const weight = this.getWorkingWeight(context, date);

      totalWeight += weight;

      if (date <= today) {
        elapsedWeight += weight;
      }
    }

    if (totalWeight <= 0) {
      const totalMs = end.getTime() - start.getTime();
      if (totalMs <= 0) return 1;

      return Math.min(
        1,
        Math.max(0, (today.getTime() - start.getTime()) / totalMs),
      );
    }

    return Math.min(1, Math.max(0, elapsedWeight / totalWeight));
  }

  private getWorkingWeight(context: RepContext, date: Date) {
    const dateKey = this.formatDate(date);

    const override = context.cycle?.dayOverrides?.find(
      (item: any) => this.formatDate(item.date) === dateKey,
    );

    if (override) {
      return override.isWorking ? override.workloadFactor : 0;
    }

    const weekday = date.getUTCDay();

    const cycleRule = context.cycle?.workingDays?.find(
      (item: any) => item.weekday === weekday,
    );

    if (cycleRule) {
      return cycleRule.isWorking ? cycleRule.workloadFactor : 0;
    }

    const organizationRule =
      context.cycle?.organization?.defaultWorkingDays?.find(
        (item: any) => item.weekday === weekday,
      );

    if (organizationRule) {
      return organizationRule.isWorking ? organizationRule.workloadFactor : 0;
    }

    return 1;
  }

  private toDateOnly(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private toDateOnlyInTimeZone(value: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(value);

    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<string, number>;

    return new Date(Date.UTC(values.year, values.month - 1, values.day));
  }

  private clampDate(value: Date, min: Date, max: Date) {
    if (value < min) return new Date(min);
    if (value > max) return new Date(max);
    return new Date(value);
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
