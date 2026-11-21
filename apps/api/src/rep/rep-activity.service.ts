import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { dateInZone } from './rep-workspace.service.js';
import {
  ReportQueryDto,
  SaveReportDto,
  RequestLeaveDto,
} from './dto/activity.dto.js';

type Db = Prisma.TransactionClient;
export type Upload = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};
const dayMs = 86400000;
const day = (date: Date) => date.toISOString().slice(0, 10);
export function parseDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || day(date) !== value)
    throw new BadRequestException('التاريخ غير صالح.');
  return date;
}
const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const leaveSelect = {
  id: true,
  type: true,
  startsOn: true,
  endsOn: true,
  requestedDays: true,
  reason: true,
  status: true,
  reviewNote: true,
  createdAt: true,
  approver: { select: { id: true, name: true } },
  attachment: { select: { id: true, name: true } },
} as const;

@Injectable()
export class RepActivityService {
  constructor(private readonly prisma: PrismaService) {}
  private org(user: AuthUser) {
    if (!user.organizationId)
      throw new ForbiddenException('الحساب غير مرتبط بشركة.');
    return user.organizationId;
  }
  private async settings(user: AuthUser, db: Db = this.prisma) {
    const settings = await db.organizationSettings.findUnique({
      where: { organizationId: this.org(user) },
    });
    if (!settings) throw new BadRequestException('إعدادات الشركة غير مكتملة.');
    return settings;
  }
  private async reportData(
    user: AuthUser,
    query: ReportQueryDto,
    db: Db = this.prisma,
  ) {
    const org = this.org(user),
      settings = await this.settings(user, db);
    const today = dateInZone(new Date(), settings.timezone);
    const to = query.to ?? today;
    const end = parseDay(to);
    const from =
      query.from ??
      (query.period === 'DAILY'
        ? to
        : day(new Date(end.getTime() - 6 * dayMs)));
    const start = parseDay(from);
    const calendarDays = (end.getTime() - start.getTime()) / dayMs + 1;
    if (calendarDays < 1 || calendarDays > 366 || to > today)
      throw new BadRequestException(
        'اختر فترة صحيحة لا تتجاوز سنة أو تاريخ اليوم.',
      );
    if (query.period === 'DAILY' && from !== to)
      throw new BadRequestException('التقرير اليومي يخص يوماً واحداً.');
    const [visits, profiles, orgRules] = await Promise.all([
      db.visit.findMany({
        where: {
          organizationId: org,
          repId: user.id,
          status: 'COMPLETED',
          completedAt: {
            gte: new Date(start.getTime() - dayMs),
            lt: new Date(end.getTime() + 2 * dayMs),
          },
        },
        include: {
          cycle: { select: { timezone: true } },
          target: { select: { type: true } },
          teamCredits: {
            include: {
              teamScopeTarget: {
                include: { teamPeriod: { select: { teamId: true } } },
              },
            },
          },
        },
      }),
      db.repCycleProfile.findMany({
        where: {
          organizationId: org,
          repId: user.id,
          cycle: { startsAt: { lte: end }, endsAt: { gte: start } },
        },
        include: {
          targets: true,
          cycle: { include: { workingDays: true, dayOverrides: true } },
        },
        orderBy: { cycle: { startsAt: 'desc' } },
      }),
      db.organizationWorkingDayRule.findMany({
        where: { organizationId: org },
      }),
    ]);
    const profile = profiles.find(
      (p) => p.cycle.endsAt >= end && p.cycle.startsAt <= end,
    );
    const selected = visits.filter((v) => {
      const d = dateInZone(v.completedAt!, v.cycle.timezone);
      return d >= from && d <= to;
    });
    let workingDays = 0;
    for (let time = start.getTime(); time <= end.getTime(); time += dayMs) {
      const date = new Date(time);
      const dayProfile = profiles.find(
        (p) => date >= p.cycle.startsAt && date <= p.cycle.endsAt,
      );
      const rule =
        (dayProfile
          ? (dayProfile.cycle.dayOverrides.find(
              (r) => day(r.date) === day(date),
            ) ??
            dayProfile.cycle.workingDays.find(
              (r) => r.weekday === date.getUTCDay(),
            ))
          : undefined) ?? orgRules.find((r) => r.weekday === date.getUTCDay());
      workingDays += rule ? (rule.isWorking ? rule.workloadFactor : 0) : 1;
    }
    let coverage = 0;
    if (profile) {
      const counts = await db.visit.findMany({
        where: {
          organizationId: org,
          repId: user.id,
          repCycleProfileId: profile.id,
          status: 'COMPLETED',
          completedAt: { lt: new Date(end.getTime() + 2 * dayMs) },
        },
        select: { targetId: true, completedAt: true },
      });
      const byTarget = new Map<string, number>();
      for (const v of counts)
        if (dateInZone(v.completedAt!, profile.cycle.timezone) <= to)
          byTarget.set(v.targetId, (byTarget.get(v.targetId) ?? 0) + 1);
      const doctorIds = await db.fieldTarget.findMany({
        where: {
          organizationId: org,
          type: 'DOCTOR',
          id: { in: profile.targets.map((t) => t.targetId) },
        },
        select: { id: true },
      });
      const ids = new Set(doctorIds.map((t) => t.id)),
        targets = profile.targets.filter((t) => ids.has(t.targetId));
      const required = targets.reduce((n, t) => n + t.requiredVisits, 0),
        credited = targets.reduce(
          (n, t) =>
            n + Math.min(t.requiredVisits, byTarget.get(t.targetId) ?? 0),
          0,
        );
      coverage = required ? Math.round((100 * credited) / required) : 0;
    }
    const summarize = (items: typeof selected) => ({
      total: items.length,
      doctors: items.filter((v) => v.target.type === 'DOCTOR').length,
      pharmacies: items.filter((v) => v.target.type === 'PHARMACY').length,
      hospitals: items.filter((v) => v.target.type === 'HOSPITAL').length,
      averagePerDay: workingDays
        ? Math.round((items.length / workingDays) * 10) / 10
        : 0,
    });
    // Team reports only include attributed visits. Legacy visits without credits stay in the representative/company report.
    const periods = await db.repCycleTeamPeriod.findMany({
      where: {
        repCycleProfile: {
          repId: user.id,
          organizationId: org,
          cycle: { startsAt: { lte: end }, endsAt: { gte: start } },
        },
        team: { organizationId: org, deletedAt: null },
        startedAt: { lte: end },
        OR: [{ endedAt: null }, { endedAt: { gte: start } }],
      },
      select: { teamId: true },
    });
    const unallocatedVisits = selected.filter(
      (v) => v.teamCredits.length === 0,
    ).length;
    const teamIds = [
      ...new Set([
        ...periods.map((p) => p.teamId),
        ...selected.flatMap((v) =>
          v.teamCredits.map((c) => c.teamScopeTarget.teamPeriod.teamId),
        ),
      ]),
    ];
    const teams = teamIds.map((teamId) => ({
      teamId,
      snapshot: {
        from,
        to,
        period: query.period,
        workingDays,
        attributionComplete: unallocatedVisits === 0,
        ...summarize(
          selected.filter((v) =>
            v.teamCredits.some(
              (c) => c.teamScopeTarget.teamPeriod.teamId === teamId,
            ),
          ),
        ),
      },
    }));
    return {
      snapshot: {
        from,
        to,
        today,
        unallocatedVisits,
        period: query.period,
        workingDays,
        cycleName: profile?.cycle.name ?? null,
        coverage,
        ...summarize(selected),
      },
      teams,
    };
  }
  async reportPreview(user: AuthUser, query: ReportQueryDto) {
    return (await this.reportData(user, query)).snapshot;
  }
  async reports(user: AuthUser) {
    return {
      items: await this.prisma.repReport.findMany({
        where: { organizationId: this.org(user), repId: user.id },
        select: {
          id: true,
          period: true,
          startsOn: true,
          endsOn: true,
          createdAt: true,
          snapshot: true,
          _count: { select: { teams: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      }),
    };
  }
  async saveReport(user: AuthUser, dto: SaveReportDto) {
    const replay = async (db: Db) => {
      const old = await db.repReport.findUnique({
        where: { clientRef: dto.clientRef },
        include: { _count: { select: { teams: true } } },
      });
      if (!old) return null;
      if (
        old.organizationId !== this.org(user) ||
        old.repId !== user.id ||
        old.period !== dto.period ||
        (dto.from && day(old.startsOn) !== dto.from) ||
        (dto.to && day(old.endsOn) !== dto.to)
      )
        throw new ConflictException('مرجع التقرير مستخدم لطلب مختلف.');
      return { id: old.id, teamCount: old._count.teams };
    };
    try {
      return await this.prisma.$transaction(
        async (db) => {
          const old = await replay(db);
          if (old) return old;
          const data = await this.reportData(user, dto, db);
          const report = await db.repReport.create({
            data: {
              clientRef: dto.clientRef,
              organizationId: this.org(user),
              repId: user.id,
              period: dto.period,
              startsOn: parseDay(data.snapshot.from),
              endsOn: parseDay(data.snapshot.to),
              snapshot: json(data.snapshot),
              teams: {
                create: data.teams.map((t) => ({
                  teamId: t.teamId,
                  snapshot: json(t.snapshot),
                })),
              },
            },
          });
          await db.auditLog.create({
            data: {
              organizationId: this.org(user),
              actorId: user.id,
              action: 'CREATE',
              entityType: 'RepReport',
              entityId: report.id,
              afterData: { teamCount: data.teams.length },
            },
          });
          return { id: report.id, teamCount: data.teams.length };
        },
        { isolationLevel: 'RepeatableRead', timeout: 15000 },
      );
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const old = await replay(this.prisma);
        if (old) return old;
      }
      throw err;
    }
  }
  async teamReports(user: AuthUser, teamId: string) {
    const now = new Date();
    const team = await this.prisma.team.findFirst({
      where: {
        id: teamId,
        organizationId: this.org(user),
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
    });
    if (!team) throw new ForbiddenException('لا يمكنك عرض تقارير هذا الفريق.');
    return {
      items: await this.prisma.repReportTeam.findMany({
        where: { teamId, report: { organizationId: this.org(user) } },
        select: {
          reportId: true,
          snapshot: true,
          report: {
            select: {
              createdAt: true,
              rep: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { report: { createdAt: 'desc' } },
        take: 100,
      }),
    };
  }
  async approver(user: AuthUser, db: Db = this.prisma) {
    const org = this.org(user),
      now = new Date(),
      settings = await this.settings(user, db),
      today = parseDay(dateInZone(now, settings.timezone));
    const rep = await db.repProfile.findFirst({
      where: { userId: user.id, organizationId: org },
      select: {
        leaveApprover: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });
    if (rep?.leaveApprover) {
      const a = rep.leaveApprover;
      if (
        a.organizationId === org &&
        a.status === 'ACTIVE' &&
        !a.deletedAt &&
        a.id !== user.id
      )
        return { id: a.id, name: a.name };
      return null;
    }
    const periods = await db.repCycleTeamPeriod.findMany({
      where: {
        repCycleProfile: {
          repId: user.id,
          organizationId: org,
          isActive: true,
          cycle: { status: 'ACTIVE' },
        },
        startedAt: { lte: today },
        OR: [{ endedAt: null }, { endedAt: { gte: today } }],
      },
      select: { teamId: true },
    });
    const managers = await db.teamMember.findMany({
      where: {
        teamId: { in: periods.map((p) => p.teamId) },
        team: { organizationId: org, isActive: true, deletedAt: null },
        user: { organizationId: org, status: 'ACTIVE', deletedAt: null },
        userId: { not: user.id },
        isManager: true,
        startedAt: { lte: now },
        OR: [{ endedAt: null }, { endedAt: { gt: now } }],
      },
      select: { user: { select: { id: true, name: true } } },
    });
    const unique = [
      ...new Map(managers.map((m) => [m.user.id, m.user])).values(),
    ];
    return unique.length === 1 ? unique[0] : null;
  }
  async leaves(user: AuthUser) {
    const org = this.org(user),
      settings = await this.settings(user),
      today = dateInZone(new Date(), settings.timezone),
      year = Number(today.slice(0, 4));
    const [items, balance, approved, approver] = await Promise.all([
      this.prisma.leaveRequest.findMany({
        where: { organizationId: org, requesterId: user.id },
        select: leaveSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      }),
      this.prisma.leaveBalance.findFirst({
        where: { organizationId: org, userId: user.id, year },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          organizationId: org,
          requesterId: user.id,
          status: 'APPROVED',
          type: 'ANNUAL',
          startsOn: { lte: parseDay(`${year}-12-31`) },
          endsOn: { gte: parseDay(`${year}-01-01`) },
        },
      }),
      this.approver(user),
    ]);
    const allocated = balance
      ? balance.allocatedDays + balance.carriedDays + balance.adjustmentDays
      : settings.defaultAnnualLeaveDays;
    const used = approved.reduce(
      (sum, l) =>
        sum +
        ((Math.min(l.endsOn.getTime(), parseDay(`${year}-12-31`).getTime()) -
          Math.max(l.startsOn.getTime(), parseDay(`${year}-01-01`).getTime())) /
          dayMs +
          1) *
          (l.dayPart === 'HALF_DAY' ? 0.5 : 1),
      0,
    );
    return { today, year, balance: allocated - used, approver, items };
  }
  async requestLeave(user: AuthUser, dto: RequestLeaveDto, file?: Upload) {
    const org = this.org(user),
      from = parseDay(dto.from),
      to = parseDay(dto.to),
      days = (to.getTime() - from.getTime()) / dayMs + 1;
    if (days < 1 || days > 366)
      throw new BadRequestException('اختر فترة إجازة صحيحة لا تتجاوز سنة.');
    if (file) {
      const b = file.buffer;
      const valid =
        (file.mimetype === 'application/pdf' &&
          b.subarray(0, 5).toString() === '%PDF-') ||
        (file.mimetype === 'image/png' &&
          b
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (file.mimetype === 'image/jpeg' &&
          b[0] === 255 &&
          b[1] === 216 &&
          b[2] === 255);
      if (!valid || file.size > 2 * 1024 * 1024)
        throw new BadRequestException(
          'المرفق يجب أن يكون PDF أو صورة PNG/JPEG بحجم أقصاه 2 ميغابايت.',
        );
    }
    const replay = async (db: Db) => {
      const old = await db.leaveRequest.findUnique({
        where: { clientRef: dto.clientRef },
        include: { attachment: true },
      });
      if (!old) return null;
      const hash = (b: Uint8Array) =>
        createHash('sha256').update(b).digest('hex');
      if (
        old.organizationId !== org ||
        old.requesterId !== user.id ||
        old.type !== dto.type ||
        day(old.startsOn) !== dto.from ||
        day(old.endsOn) !== dto.to ||
        (old.reason ?? '') !== (dto.reason?.trim() ?? '') ||
        Boolean(old.attachment) !== Boolean(file) ||
        (old.attachment &&
          file &&
          hash(old.attachment.content) !== hash(file.buffer))
      )
        throw new ConflictException('مرجع الطلب مستخدم لبيانات مختلفة.');
      return { id: old.id, routed: Boolean(old.approverId) };
    };
    try {
      return await this.prisma.$transaction(async (db) => {
        const old = await replay(db);
        if (old) return old;
        const approver = await this.approver(user, db);
        const leave = await db.leaveRequest.create({
          data: {
            clientRef: dto.clientRef,
            organizationId: org,
            requesterId: user.id,
            approverId: approver?.id,
            type: dto.type,
            startsOn: from,
            endsOn: to,
            requestedDays: days,
            reason: dto.reason?.trim(),
            ...(file
              ? {
                  attachment: {
                    create: {
                      name: file.originalname
                        .split('')
                        .map((c) =>
                          c.charCodeAt(0) < 32 || c === '/' || c === '\\'
                            ? '_'
                            : c,
                        )
                        .join('')
                        .slice(0, 180),
                      mimeType: file.mimetype,
                      content: new Uint8Array(file.buffer),
                    },
                  },
                }
              : {}),
          },
        });
        if (approver)
          await db.notification.create({
            data: {
              organizationId: org,
              userId: approver.id,
              title: 'طلب إجازة جديد',
              message: `طلب إجازة من ${user.name}`,
              data: { leaveId: leave.id },
            },
          });
        await db.auditLog.create({
          data: {
            organizationId: org,
            actorId: user.id,
            action: 'CREATE',
            entityType: 'LeaveRequest',
            entityId: leave.id,
            afterData: {
              type: dto.type,
              days,
              approverId: approver?.id ?? null,
            },
          },
        });
        return { id: leave.id, routed: Boolean(approver) };
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const old = await replay(this.prisma);
        if (old) return old;
      }
      throw err;
    }
  }
  async attachment(user: AuthUser, id: string) {
    const result = await this.prisma.leaveAttachment.findFirst({
      where: {
        id,
        leave: {
          organizationId: this.org(user),
          OR: [{ requesterId: user.id }, { approverId: user.id }],
        },
      },
    });
    if (!result) throw new NotFoundException('المرفق غير موجود.');
    return result;
  }
}
