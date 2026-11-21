import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { dateInZone } from '../rep/rep-workspace.service.js';
import type { Prisma } from '../generated/prisma/client.js';
type Db = Prisma.TransactionClient;
@Injectable()
export class ManagerService {
  constructor(private readonly prisma: PrismaService) {}
  private org(user: AuthUser) {
    if (!user.organizationId)
      throw new ForbiddenException('الحساب غير مرتبط بشركة.');
    return user.organizationId;
  }
  private teams(user: AuthUser, db: Db = this.prisma) {
    const now = new Date();
    return db.team.findMany({
      where: {
        organizationId: this.org(user),
        isActive: true,
        deletedAt: null,
        members: {
          some: {
            userId: user.id,
            isManager: true,
            startedAt: { lte: now },
            OR: [{ endedAt: null }, { endedAt: { gt: now } }],
          },
        },
      },
      include: {
        province: { select: { id: true, name: true } },
        specialties: {
          include: { specialty: { select: { id: true, name: true } } },
        },
        products: {
          include: {
            product: { select: { id: true, name: true, genericName: true } },
          },
        },
        areas: { include: { area: { select: { id: true, name: true } } } },
      },
      orderBy: { name: 'asc' },
    });
  }
  async workspace(user: AuthUser) {
    const organizationId = this.org(user),
      teams = await this.teams(user),
      teamIds = teams.map((t) => t.id);
    const [cycles, settings, orgWorkingDays] = await Promise.all([
      this.prisma.cycle.findMany({
        where: { organizationId, status: 'ACTIVE' },
        include: {
          workingDays: true,
          classRules: { include: { targetClass: true } },
        },
        orderBy: { startsAt: 'desc' },
      }),
      this.prisma.organizationSettings.findUnique({
        where: { organizationId },
      }),
      this.prisma.organizationWorkingDayRule.findMany({
        where: { organizationId },
        orderBy: { weekday: 'asc' },
      }),
    ]);
    const cycle = cycles.find((c) => {
      const today = dateInZone(new Date(), c.timezone);
      return (
        c.startsAt.toISOString().slice(0, 10) <= today &&
        c.endsAt.toISOString().slice(0, 10) >= today
      );
    });
    const periods = cycle
      ? await this.prisma.repCycleTeamPeriod.findMany({
          where: {
            teamId: { in: teamIds },
            startedAt: {
              lte: new Date(
                `${dateInZone(new Date(), cycle.timezone)}T00:00:00Z`,
              ),
            },
            repCycleProfile: { organizationId, cycleId: cycle.id },
          },
          include: {
            repCycleProfile: {
              select: {
                repId: true,
                dailyVisitTarget: true,
                rep: { select: { id: true, name: true, status: true } },
              },
            },
            scopeAreas: {
              include: { area: { select: { id: true, name: true } } },
            },
            scopeProducts: {
              include: {
                product: {
                  select: { id: true, name: true, genericName: true },
                },
              },
            },
            scopeTargets: {
              include: {
                repCycleTarget: {
                  include: {
                    targetClass: true,
                    target: {
                      include: {
                        locations: {
                          include: {
                            area: { select: { id: true, name: true } },
                          },
                        },
                        specialties: {
                          include: {
                            specialty: { select: { id: true, name: true } },
                          },
                        },
                      },
                    },
                  },
                },
                credits: {
                  where: { visit: { organizationId, status: 'COMPLETED' } },
                  include: {
                    visit: {
                      select: {
                        id: true,
                        roundId: true,
                        completedAt: true,
                        createdAt: true,
                        targetId: true,
                        repId: true,
                      },
                    },
                    products: {
                      include: {
                        product: {
                          select: { id: true, name: true, genericName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        })
      : [];
    const reps = new Map<
      string,
      {
        id: string;
        name: string;
        status: string;
        teamIds: string[];
        areas: { id: string; name: string }[];
        requiredVisits: number;
        completedVisits: number;
        coverage: number;
        lastVisit: string | null;
        scopeConfigured: boolean;
      }
    >();
    const targets = new Map<
      string,
      {
        key: string;
        id: string;
        name: string;
        type: string;
        repId: string;
        repName: string;
        teamId: string;
        teamName: string;
        classCode: string;
        specialtyId: string | null;
        specialties: string[];
        areas: { id: string; name: string }[];
        requiredVisits: number;
        completedVisits: number;
        coverage: number;
        lastVisit: string | null;
      }
    >();
    const visits = new Map<
      string,
      {
        id: string;
        roundId: string | null;
        recordedAt: string;
        date: string;
        repId: string;
        repName: string;
        targetId: string;
        targetName: string;
        type: string;
        teamIds: string[];
        areas: { id: string; name: string }[];
        products: { id: string; name: string }[];
      }
    >();
    const union = <T extends { id: string }>(items: T[]) => [
      ...new Map(items.map((i) => [i.id, i])).values(),
    ];
    for (const period of periods) {
      const rp = period.repCycleProfile,
        team = teams.find((t) => t.id === period.teamId)!;
      const rep = reps.get(rp.repId) ?? {
        id: rp.repId,
        name: rp.rep.name,
        status: rp.rep.status,
        teamIds: [],
        areas: [],
        requiredVisits: 0,
        completedVisits: 0,
        coverage: 0,
        lastVisit: null,
        scopeConfigured: false,
      };
      rep.teamIds = [...new Set([...rep.teamIds, team.id])];
      rep.areas = union([
        ...rep.areas,
        ...period.scopeAreas.map((a) => a.area),
      ]);
      rep.scopeConfigured ||= period.scopeConfigured;
      reps.set(rep.id, rep);
      for (const scope of period.scopeTargets) {
        const assignment = scope.repCycleTarget,
          target = assignment.target,
          key = `${team.id}:${assignment.id}`;
        const areas = target.locations
          .filter((l) => period.scopeAreas.some((a) => a.areaId === l.areaId))
          .map((l) => l.area);
        const item = targets.get(key) ?? {
          key,
          id: target.id,
          name: target.name,
          type: target.type,
          repId: rep.id,
          repName: rep.name,
          teamId: team.id,
          teamName: team.name,
          classCode: assignment.targetClass.code,
          specialtyId: target.specialties[0]?.specialty.id ?? null,
          specialties: target.specialties.map((s) => s.specialty.name),
          areas: [],
          requiredVisits: 0,
          completedVisits: 0,
          coverage: 0,
          lastVisit: null as string | null,
        };
        item.areas = union([...item.areas, ...areas]);
        item.requiredVisits = Math.max(
          item.requiredVisits,
          scope.requiredVisits,
        );
        item.completedVisits += scope.credits.length;
        targets.set(key, item);
        for (const credit of scope.credits) {
          const v = credit.visit;
          if (!v.completedAt) continue;
          const visitDay = dateInZone(v.completedAt, cycle!.timezone);
          if (!item.lastVisit || visitDay > item.lastVisit) item.lastVisit = visitDay;
          const existing = visits.get(v.id) ?? {
            id: v.id,
            roundId: v.roundId,
            recordedAt: v.createdAt.toISOString(),
            date: dateInZone(v.completedAt, cycle!.timezone),
            repId: rep.id,
            repName: rep.name,
            targetId: target.id,
            targetName: target.name,
            type: target.type,
            teamIds: [],
            areas: [],
            products: [],
          };
          existing.teamIds = [...new Set([...existing.teamIds, team.id])];
          existing.areas = union([...existing.areas, ...areas]);
          existing.products = union([
            ...existing.products,
            ...credit.products.map((p) => p.product),
          ]);
          visits.set(v.id, existing);
        }
      }
    }
    const targetRows = [...targets.values()].map((t) => ({
      remainingVisits: Math.max(0, t.requiredVisits - t.completedVisits),
      progressStatus: t.requiredVisits > 0 && t.completedVisits === 0 ? "UNVISITED" : t.completedVisits < t.requiredVisits ? "INCOMPLETE" : "COMPLETE",
      ...t,
      coverage: t.requiredVisits
        ? Math.min(
            100,
            Math.round((t.completedVisits / t.requiredVisits) * 100),
          )
        : 0,
    }));
    const doctorProgress = (rows: typeof targetRows) => {
      const doctors = rows.filter(t => t.type === 'DOCTOR');
      return {
        uniqueDoctors: new Set(doctors.map(t => t.id)).size,
        assignments: doctors.length,
        unvisited: doctors.filter(t => t.progressStatus === 'UNVISITED').length,
        incomplete: doctors.filter(t => t.progressStatus === 'INCOMPLETE').length,
        complete: doctors.filter(t => t.progressStatus === 'COMPLETE').length,
      };
    };
    const visitRows = [...visits.values()].sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.recordedAt.localeCompare(a.recordedAt) ||
        b.id.localeCompare(a.id),
    );
    const coverage = (items: typeof targetRows) => {
      const required = items.reduce((n, t) => n + t.requiredVisits, 0),
        credited = items.reduce(
          (n, t) => n + Math.min(t.completedVisits, t.requiredVisits),
          0,
        );
      return {
        required,
        remaining: required - credited,
        percent: required ? Math.round((credited / required) * 100) : 0,
      };
    };
    const repRows = [...reps.values()].map((r) => {
      const own = visitRows.filter((v) => v.repId === r.id),
        c = coverage(targetRows.filter((t) => t.repId === r.id));
      return {
        ...r,
        doctorProgress: doctorProgress(targetRows.filter(t => t.repId === r.id)),
        requiredVisits: c.required,
        completedVisits: own.length,
        coverage: c.percent,
        lastVisit: own[0]?.date ?? null,
      };
    });
    const allAreas = await this.prisma.area.findMany({
      where: {
        organizationId,
        deletedAt: null,
        provinceId: {
          in: [
            ...new Set(
              teams.flatMap((t) => (t.provinceId ? [t.provinceId] : [])),
            ),
          ],
        },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const areaRows = allAreas.map((a) => {
      const rows = targetRows.filter((t) => t.areas.some((x) => x.id === a.id));
      const assignedReps = repRows
        .filter((r) => r.areas.some((area) => area.id === a.id))
        .map((r) => {
          const own = rows.filter((t) => t.repId === r.id);
          const c = coverage(own);
          const doctors = own.filter((t) => t.type === 'DOCTOR');
          return {
            id: r.id,
            name: r.name,
            coverage: c.percent,
            requiredVisits: c.required,
            creditedVisits: c.required - c.remaining,
            doctors: new Set(doctors.map((t) => t.id)).size,
            visitedDoctors: new Set(
              doctors.filter((t) => t.completedVisits > 0).map((t) => t.id),
            ).size,
          };
        });
      return {
        ...a,
        coverage: coverage(rows).percent,
        targets: new Set(rows.map((t) => t.id)).size,
        repNames: assignedReps.map((r) => r.name),
        reps: assignedReps,
        counts: {
          reps: assignedReps.length,
          doctors: new Set(
            rows.filter((t) => t.type === 'DOCTOR').map((t) => t.id),
          ).size,
          pharmacies: new Set(
            rows.filter((t) => t.type === 'PHARMACY').map((t) => t.id),
          ).size,
          hospitals: new Set(
            rows.filter((t) => t.type === 'HOSPITAL').map((t) => t.id),
          ).size,
        },
      };
    });
    const allProducts = union([
      ...teams.flatMap((t) => t.products.map((p) => p.product)),
      ...periods.flatMap((p) => p.scopeProducts.map((a) => a.product)),
    ]);
    const productRows = allProducts.map((p) => ({
      ...p,
      promotions: visitRows.filter((v) => v.products.some((x) => x.id === p.id))
        .length,
    }));
    const roundLocations = await this.prisma.fieldRound.findMany({where:{organizationId, id:{in:[...new Set(visitRows.flatMap(v=>v.roundId?[v.roundId]:[]))]}},select:{id:true,registrationLocation:true}});
    const roundMap = new Map<
      string,
      {
        id: string;
        repId: string;
        repName: string;
        date: string;
        type: string;
        areas: { id: string; name: string }[];
        visits: typeof visitRows;
      }
    >();
    for (const v of visitRows) {
      const key = `${v.roundId ?? v.id}:${v.type}`;
      const r = roundMap.get(key) ?? {
        id: key,
        repId: v.repId,
        repName: v.repName,
        date: v.date,
        type: v.type,
        areas: [],
        visits: [],
      };
      r.visits.push(v);
      r.areas = union([...r.areas, ...v.areas]);
      roundMap.set(key, r);
    }
    const today = cycle
      ? dateInZone(new Date(), cycle.timezone)
      : dateInZone(new Date(), settings?.timezone ?? 'UTC');
    const week = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - 6 + i);
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        count: visitRows.filter((v) => v.date === key).length,
      };
    });
    const teamRows = teams.map((t) => {
      const own = targetRows.filter((x) => x.teamId === t.id);
      return {
        id: t.id,
        name: t.name,
        province: t.province,
        specialties: t.specialties.map((s) => s.specialty),
        products: t.products.map((p) => p.product),
        repCount: repRows.filter((r) => r.teamIds.includes(t.id)).length,
        coverage: coverage(own).percent,
        doctorProgress: doctorProgress(own),
      };
    });
    const pendingLeaves = user.permissions.includes('leaves.approve_team')
      ? await this.prisma.leaveRequest.count({
          where: { organizationId, approverId: user.id, status: 'PENDING' },
        })
      : 0;
    const reportCount = user.permissions.includes('reports.view_team')
      ? await this.prisma.repReportTeam.count({
          where: { teamId: { in: teamIds }, report: { organizationId } },
        })
      : 0;
    const totals = coverage(targetRows);
    return {
      teams: teamRows,
      cycle: cycle
        ? {
            id: cycle.id,
            name: cycle.name,
            startsOn: cycle.startsAt.toISOString().slice(0, 10),
            endsOn: cycle.endsAt.toISOString().slice(0, 10),
          }
        : null,
      today,
      reps: repRows,
      targets: targetRows,
      areas: areaRows,
      products: productRows,
      rounds: [...roundMap.values()].map(r=>({...r, registrationLocation:roundLocations.find(x=>r.id.startsWith(x.id+":"))?.registrationLocation ?? null})),
      week,
      summary: {
        visitsToday: visitRows.filter((v) => v.date === today).length,
        areaCoverage: areaRows.length
          ? Math.round(
              areaRows.reduce((sum, a) => sum + a.coverage, 0) /
                areaRows.length,
            )
          : 0,
        lowCoverageAreas: areaRows.filter((a) => a.coverage < 60).length,
        averageRepCoverage: repRows.length
          ? Math.round(
              repRows.reduce((sum, r) => sum + r.coverage, 0) / repRows.length,
            )
          : 0,
        pendingReports: null,
        overdueVisits: null,
        reps: repRows.length,
        visits: visitRows.length,
        coverage: totals.percent,
        doctors: new Set(
          targetRows.filter((t) => t.type === 'DOCTOR').map((t) => t.id),
        ).size,
        reports: reportCount,
        pendingLeaves,
        remainingVisits: totals.remaining,
      },
      unconfiguredPeriods: periods.filter((p) => !p.scopeConfigured).length,
      settings: {
        roundEditWindowHours: settings?.roundEditWindowHours ?? 0,
        frequency:
          cycle?.classRules.map((r) => ({
            id: r.targetClassId,
            code: r.targetClass.code,
            requiredVisits: r.requiredVisits,
          })) ?? [],
        annualLeaveDays: settings?.defaultAnnualLeaveDays ?? null,
        workingDays: cycle?.workingDays.length
          ? cycle.workingDays
          : orgWorkingDays,
      },
    };
  }
  async reports(user: AuthUser) {
    const teams = await this.teams(user);
    return {
      items: await this.prisma.repReportTeam.findMany({
        where: {
          teamId: { in: teams.map((t) => t.id) },
          report: { organizationId: this.org(user) },
        },
        select: {
          reportId: true,
          teamId: true,
          snapshot: true,
          team: { select: { name: true } },
          report: {
            select: {
              createdAt: true,
              rep: { select: { id: true, name: true } },
              period: true,
              startsOn: true,
              endsOn: true,
            },
          },
        },
        orderBy: { report: { createdAt: 'desc' } },
        take: 100,
      }),
    };
  }
  async leaves(user: AuthUser) {
    return {
      items: await this.prisma.leaveRequest.findMany({
        where: { organizationId: this.org(user), approverId: user.id },
        select: {
          id: true,
          type: true,
          startsOn: true,
          endsOn: true,
          requestedDays: true,
          reason: true,
          status: true,
          reviewNote: true,
          requester: { select: { id: true, name: true } },
          attachment: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      }),
    };
  }
  async decideLeave(
    user: AuthUser,
    id: string,
    status: 'APPROVED' | 'REJECTED',
    reviewNote?: string,
  ) {
    return this.prisma.$transaction(async (db) => {
      const leave = await db.leaveRequest.findFirst({
        where: { id, organizationId: this.org(user), approverId: user.id },
      });
      if (!leave) throw new NotFoundException('طلب الإجازة غير متاح لك.');
      if (leave.status === status && leave.reviewerId === user.id)
        return { id, status };
      if (leave.status !== 'PENDING')
        throw new ConflictException('تمت مراجعة هذا الطلب مسبقاً.');
      const result = await db.leaveRequest.updateMany({
        where: {
          id,
          organizationId: this.org(user),
          approverId: user.id,
          status: 'PENDING',
        },
        data: {
          status,
          reviewerId: user.id,
          reviewedAt: new Date(),
          reviewNote: reviewNote?.trim(),
        },
      });
      if (result.count !== 1)
        throw new ConflictException(
          'تمت مراجعة هذا الطلب بالتزامن. أعد تحميل القائمة.',
        );
      await db.notification.create({
        data: {
          organizationId: this.org(user),
          userId: leave.requesterId,
          type: status === 'APPROVED' ? 'SUCCESS' : 'WARNING',
          title:
            status === 'APPROVED'
              ? 'تم قبول طلب الإجازة'
              : 'تم رفض طلب الإجازة',
          message: `${leave.startsOn.toISOString().slice(0, 10)} — ${leave.endsOn.toISOString().slice(0, 10)}${reviewNote ? `\n${reviewNote.trim()}` : ''}`,
          data: { leaveId: id },
        },
      });
      await db.auditLog.create({
        data: {
          organizationId: this.org(user),
          actorId: user.id,
          action: status === 'APPROVED' ? 'APPROVE' : 'REJECT',
          entityType: 'LeaveRequest',
          entityId: id,
          beforeData: { status: 'PENDING' },
          afterData: { status },
        },
      });
      return { id, status };
    });
  }
}
