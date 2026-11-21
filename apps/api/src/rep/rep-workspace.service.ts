import { isWriteConflict } from '../database/write-conflict.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { RegisterRoundDto, TargetsQueryDto } from './dto/round.dto.js';
import { loadTeamScope, creditsForTarget } from '../teams/team-scope.js';

export function dateInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

// The UI supplies a calendar date. Store its local noon as an unambiguous instant.
export function visitInstant(day: string, timeZone: string) {
  const utc = new Date(`${day}T12:00:00.000Z`);
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== day)
    throw new BadRequestException('تاريخ الزيارة غير صالح.');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(utc);
  const offset =
    parts.find((p) => p.type === 'timeZoneName')!.value.replace('GMT', '') ||
    '+00:00';
  return new Date(`${day}T12:00:00${offset}`);
}

@Injectable()
export class RepWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  private async context(
    user: AuthUser,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    if (!user.organizationId)
      throw new ForbiddenException('الحساب غير مرتبط بمؤسسة.');
    const profiles = await db.repCycleProfile.findMany({
      where: {
        repId: user.id,
        organizationId: user.organizationId,
        isActive: true,
        cycle: { organizationId: user.organizationId, status: 'ACTIVE' },
      },
      include: { cycle: true },
      orderBy: { cycle: { startsAt: 'desc' } },
    });
    return (
      profiles.find((p) => {
        const today = dateInZone(new Date(), p.cycle.timezone);
        return (
          p.cycle.startsAt.toISOString().slice(0, 10) <= today &&
          p.cycle.endsAt.toISOString().slice(0, 10) >= today
        );
      }) ?? null
    );
  }

  private async snapshot(user: AuthUser) {
    const profile = await this.context(user);
    if (!profile)
      return { profile: null, targets: [], areas: [], products: [] };
    const scope = await loadTeamScope(
      this.prisma,
      profile.id,
      user.organizationId!,
      dateInZone(new Date(), profile.cycle.timezone),
    );
    let [assignments, areaAssignments, productAssignments, visits] =
      await Promise.all([
        this.prisma.repCycleTarget.findMany({
          where: {
            repCycleProfileId: profile.id,
            target: {
              organizationId: user.organizationId!,
              isActive: true,
              deletedAt: null,
            },
          },
          include: {
            targetClass: true,
            target: {
              include: {
                pharmacyProfile: true,
                hospitalProfile: true,
                locations: {
                  where: {
                    area: {
                      deletedAt: null,
                      organizationId: user.organizationId!,
                    },
                  },
                  include: { area: true },
                  orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
                },
                specialties: {
                  where: { specialty: { deletedAt: null } },
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
            area: { deletedAt: null, organizationId: user.organizationId! },
          },
          include: { area: true },
          orderBy: { area: { name: 'asc' } },
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
          orderBy: { product: { name: 'asc' } },
        }),
        this.prisma.visit.groupBy({
          by: ['targetId'],
          where: { repCycleProfileId: profile.id, status: 'COMPLETED' },
          _count: { _all: true },
          _max: { completedAt: true },
        }),
      ]);
    if (scope.configured) {
      const areaIds = new Set(
        scope.periods.flatMap((p) => p.scopeAreas.map((a) => a.areaId)),
      );
      const productIds = new Set(
        scope.periods.flatMap((p) => p.scopeProducts.map((a) => a.productId)),
      );
      assignments = assignments.filter(
        (a) => creditsForTarget(scope, a.targetId, [...areaIds], []).length > 0,
      );
      areaAssignments = areaAssignments.filter((a) => areaIds.has(a.areaId));
      productAssignments = productAssignments.filter((p) =>
        productIds.has(p.productId),
      );
      for (const assignment of assignments)
        assignment.target.locations = assignment.target.locations.filter((l) =>
          areaIds.has(l.areaId),
        );
    }
    const counts = new Map(visits.map((v) => [v.targetId, v]));
    const targets = assignments.map((a) => {
      const count = counts.get(a.targetId);
      const done = count?._count._all ?? 0;
      return {
        id: a.targetId,
        name: a.target.name,
        type: a.target.type,
        affiliation: a.target.pharmacyProfile?.affiliation ?? null,
        kind: a.target.hospitalProfile?.kind ?? null,
        class: {
          id: a.targetClass.id,
          code: a.targetClass.code,
          name: a.targetClass.name,
          rank: a.targetClass.rank,
        },
        specialties: a.target.specialties.map((s) => ({
          id: s.specialtyId,
          name: s.specialty.name,
        })),
        locations: a.target.locations.map((l) => ({
          id: l.id,
          areaId: l.areaId,
          areaName: l.area.name,
          address: l.address,
        })),
        completedVisits: done,
        requiredVisits: a.requiredVisits,
        creditedVisits: Math.min(done, a.requiredVisits),
        progress:
          a.requiredVisits > 0
            ? Math.min(100, Math.round((done / a.requiredVisits) * 100))
            : 0,
        lastVisit: count?._max.completedAt
          ? dateInZone(count._max.completedAt, profile.cycle.timezone)
          : null,
        status:
          done === 0 ? 'غير مزار' : done >= a.requiredVisits ? 'مكتمل' : 'مزار',
      };
    });
    const stats = (items: typeof targets) => {
      const required = items.reduce((sum, t) => sum + t.requiredVisits, 0);
      const credited = items.reduce((sum, t) => sum + t.creditedVisits, 0);
      return {
        total: items.length,
        unvisited: items.filter((t) => !t.completedVisits).length,
        privateCount: items.filter((t) => t.kind === 'PRIVATE').length,
        aCount: items.filter((t) => t.class.code === 'A').length,
        remainingVisits: required - credited,
        requiredVisits: required,
        coverage: required ? Math.round((credited / required) * 100) : 0,
      };
    };
    const areas = areaAssignments.map((a) => ({
      id: a.areaId,
      name: a.area.name,
      byType: Object.fromEntries(
        ['DOCTOR', 'PHARMACY', 'HOSPITAL'].map((type) => [
          type,
          stats(
            targets.filter(
              (t) =>
                t.type === type &&
                t.locations.some((l) => l.areaId === a.areaId),
            ),
          ),
        ]),
      ),
      ...stats(
        targets.filter(
          (t) =>
            t.type === 'DOCTOR' &&
            t.locations.some((l) => l.areaId === a.areaId),
        ),
      ),
    }));
    return {
      profile,
      targets,
      areas,
      products: productAssignments.map((p) => ({
        id: p.productId,
        name: p.product.name,
        priority: p.priority,
        guidance: p.guidance,
      })),
      stats,
    };
  }

  async workspace(user: AuthUser) {
    const data = await this.snapshot(user);
    const locationSettings = await this.prisma.organizationSettings.findUnique({where:{organizationId:user.organizationId!}});
    if (!data.profile || !data.stats)
      return {
        cycle: null,
        areas: [],
        products: [],
        classes: [],
        specialties: [],
        summary: null,
      };
    const doctors = data.targets.filter((t) => t.type === 'DOCTOR');
    const unvisitedA = doctors.filter(
      (t) => t.class.code === 'A' && !t.completedVisits,
    );
    return {
      roundLocationPolicy: locationSettings?.roundLocationPolicy ?? "DISABLED",
      cycle: {
        id: data.profile.cycle.id,
        name: data.profile.cycle.name,
        today: dateInZone(new Date(), data.profile.cycle.timezone),
        startsOn: data.profile.cycle.startsAt.toISOString().slice(0, 10),
        endsOn: data.profile.cycle.endsAt.toISOString().slice(0, 10),
        remainingDays: Math.max(
          0,
          Math.ceil(
            (data.profile.cycle.endsAt.getTime() -
              new Date(
                `${dateInZone(new Date(), data.profile.cycle.timezone)}T00:00:00Z`,
              ).getTime()) /
              86400000,
          ),
        ),
      },
      areas: data.areas,
      products: data.products,
      plan: {
        managerInstructions: data.profile.managerInstructions,
        aCoverageTarget: data.profile.aCoverageTarget,
      },
      classes: [
        ...new Map(data.targets.map((t) => [t.class.id, t.class])).values(),
      ].sort((a, b) => a.rank - b.rank),
      specialties: [
        ...new Map(
          data.targets.flatMap((t) => t.specialties).map((s) => [s.id, s]),
        ).values(),
      ].sort((a, b) => a.name.localeCompare(b.name, 'ar')),
      summary: {
        doctors: data.stats(doctors),
        pharmacies: data.stats(
          data.targets.filter((t) => t.type === 'PHARMACY'),
        ),
        hospitals: data.stats(
          data.targets.filter((t) => t.type === 'HOSPITAL'),
        ),
        unvisitedA: unvisitedA.length,
        unvisitedAAreas: [
          ...new Map(
            unvisitedA
              .flatMap((t) => t.locations.slice(0, 1))
              .map((l) => [l.areaId, { id: l.areaId, name: l.areaName }]),
          ).values(),
        ],
        lowCoverageAreas: data.areas.filter(
          (a) => a.total > 0 && a.coverage < 50,
        ),
        areaCoverage: data.areas.length
          ? Math.round(
              data.areas.reduce((sum, a) => sum + a.coverage, 0) /
                data.areas.length,
            )
          : 0,
      },
    };
  }

  async targets(user: AuthUser, query: TargetsQueryDto) {
    const ids = (value?: string) => {
      const list = value ? value.split(',') : [];
      if (list.some((id) => !isUUID(id)))
        throw new BadRequestException('معرّف فلتر غير صالح.');
      return list;
    };
    const areas = ids(query.areaIds),
      classes = ids(query.classIds),
      specialties = ids(query.specialtyIds);
    const data = await this.snapshot(user);
    const search = query.search?.trim().toLocaleLowerCase('ar');
    return {
      items: data.targets.filter(
        (t) =>
          (!query.type || t.type === query.type) &&
          (!areas.length ||
            t.locations.some((l) => areas.includes(l.areaId))) &&
          (!classes.length || classes.includes(t.class.id)) &&
          (!specialties.length ||
            t.specialties.some((s) => specialties.includes(s.id))) &&
          (!query.affiliations ||
            query.affiliations.split(',').includes(t.affiliation ?? '')) &&
          (!query.kinds || query.kinds.split(',').includes(t.kind ?? '')) &&
          (query.unvisited !== 'true' || t.completedVisits === 0) &&
          (!search ||
            `${t.name} ${t.specialties.map((s) => s.name).join(' ')} ${t.locations.map((l) => l.areaName).join(' ')}`
              .toLocaleLowerCase('ar')
              .includes(search)),
      ),
    };
  }

  async editDetails(user: AuthUser, id: string) {
    const round = await this.prisma.fieldRound.findFirst({
      where: {
        id,
        repId: user.id,
        organizationId: user.organizationId!,
        status: 'COMPLETED',
      },
      include: {
        visits: {
          where: { status: 'COMPLETED' },
          include: { target: true, products: true },
        },
        cycle: true,
      },
    });
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId: user.organizationId! },
    });
    if (
      !round ||
      !settings?.roundEditWindowHours ||
      Date.now() >
        round.createdAt.getTime() + settings.roundEditWindowHours * 3600000
    )
      throw new ForbiddenException('الجولة غير متاحة أو انتهت مهلة تعديلها.');
    const profile = await this.context(user);
    if (profile?.cycleId !== round.cycleId)
      throw new ForbiddenException(
        'لا يمكن تعديل جولة خارج السايكل المسند حالياً.',
      );
    const type = round.visits[0]?.target.type;
    if (!type || round.visits.some((v) => v.target.type !== type))
      throw new BadRequestException(
        'الجولة القديمة متعددة الأنواع غير قابلة للتعديل بهذا النموذج.',
      );
    const available = await this.targets(user, { type });
    const selected = round.visits.map((v) =>
      available.items.find((t) => t.id === v.targetId),
    );
    if (selected.some((t) => !t))
      throw new ForbiddenException('بعض جهات الجولة لم تعد ضمن تكليفك الحالي.');
    const history = await this.history(user);
    const item = history.items.find((i) => i.roundId === id);
    return {
      id,
      revision: round.revision,
      type,
      areaIds: item?.areas.map((a) => a.id) ?? [],
      targets: selected,
      productIds: [
        ...new Set(
          round.visits.flatMap((v) => v.products.map((p) => p.productId)),
        ),
      ],
      visitDate: dateInZone(round.startedAt, round.cycle.timezone),
      notes: round.notes ?? '',
    };
  }
  async cancel(user: AuthUser, id: string, revision: number) {
    if (
      !user.organizationId ||
      !user.permissions.includes('rounds.manage_own') ||
      !user.permissions.includes('visits.edit_own')
    )
      throw new ForbiddenException();
    return this.prisma.$transaction(
      async (db) => {
        const round = await db.fieldRound.findFirst({
          where: { id, repId: user.id, organizationId: user.organizationId! },
          include: {
            visits: {
              include: {
                products: true,
                teamCredits: { include: { products: true } },
              },
            },
          },
        });
        if (!round) throw new ForbiddenException('الجولة خارج حسابك.');
        if (round.status === 'CANCELLED') return { id };
        const settings = await db.organizationSettings.findUnique({
          where: { organizationId: user.organizationId! },
        });
        if (
          round.status !== 'COMPLETED' ||
          !settings?.roundEditWindowHours ||
          Date.now() >
            round.createdAt.getTime() + settings.roundEditWindowHours * 3600000
        )
          throw new ForbiddenException('انتهت مهلة إلغاء الجولة.');
        if (round.revision !== revision)
          throw new ConflictException('تغيرت الجولة؛ أعد تحميلها قبل الإلغاء.');
        await db.fieldRound.update({
          where: { id, revision },
          data: { status: 'CANCELLED', revision: { increment: 1 } },
        });
        await db.visit.updateMany({
          where: { roundId: id },
          data: { status: 'CANCELLED' },
        });
        await db.visitTeamCredit.deleteMany({
          where: { visit: { roundId: id } },
        });
        await db.auditLog.create({
          data: {
            organizationId: user.organizationId,
            actorId: user.id,
            action: 'UPDATE',
            entityType: 'FieldRound',
            entityId: id,
            beforeData: JSON.parse(JSON.stringify(round)),
            afterData: { status: 'CANCELLED' },
          },
        });
        return { id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async history(user: AuthUser, type?: 'DOCTOR' | 'PHARMACY' | 'HOSPITAL') {
    if (!user.organizationId)
      throw new ForbiddenException('الحساب غير مرتبط بمؤسسة.');
    const visits = await this.prisma.visit.findMany({
      where: {
        organizationId: user.organizationId,
        repId: user.id,
        OR: [{ status: 'COMPLETED' }, { round: { status: 'CANCELLED' } }],
        ...(type ? { target: { type } } : {}),
      },
      include: {
        round: true,
        products: { include: { product: true } },
        cycle: { select: { timezone: true } },
        target: {
          include: {
            locations: {
              include: { area: true },
              orderBy: { isPrimary: 'desc' },
            },
          },
        },
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    });
    const roundIds = [
      ...new Set(visits.flatMap((v) => (v.roundId ? [v.roundId] : []))),
    ];
    const audits = await this.prisma.auditLog.findMany({
      where: {
        organizationId: user.organizationId,
        actorId: user.id,
        entityType: 'FieldRound',
        entityId: { in: roundIds },
        action: { in: ['CREATE', 'UPDATE'] },
      },
      select: { entityId: true, afterData: true, beforeData: true },
      orderBy: { createdAt: 'asc' },
    });
    const selectedAreas = new Map(
      audits
        .filter((a) =>
          Array.isArray(
            (a.afterData as { areaIds?: string[] } | null)?.areaIds,
          ),
        )
        .map((a) => [
          a.entityId,
          (a.afterData as { areaIds?: string[] } | null)?.areaIds ?? [],
        ]),
    );
    const areas = await this.prisma.area.findMany({
      where: {
        organizationId: user.organizationId,
        id: { in: [...new Set([...selectedAreas.values()].flat())] },
      },
      select: { id: true, name: true },
    });
    const areaMap = new Map(areas.map((a) => [a.id, a]));
    const settings = await this.prisma.organizationSettings.findUnique({
      where: { organizationId: user.organizationId },
    });
    const groups = new Map<
      string,
      {
        id: string;
        roundId: string | null;
        status: string;
        revision: number;
        cycleId: string;
        canEdit: boolean;
        notes: string;
        productIds: string[];
        type: string;
        date: string | null;
        areas: { id: string; name: string }[];
        targets: { id: string; name: string }[];
      }
    >();
    for (const visit of visits) {
      if (visit.round?.status === 'CANCELLED') {
        const cancelled = audits.find(
          (a) =>
            a.entityId === visit.roundId &&
            (a.afterData as { status?: string } | null)?.status === 'CANCELLED',
        );
        const before = (
          cancelled?.beforeData as {
            visits?: { id: string; status: string }[];
          } | null
        )?.visits;
        if (
          before &&
          !before.some((v) => v.id === visit.id && v.status === 'COMPLETED')
        )
          continue;
      }
      const key = `${visit.roundId ?? visit.id}:${visit.target.type}`;
      const group = groups.get(key) ?? {
        id: key,
        roundId: visit.roundId,
        status: visit.round?.status ?? 'COMPLETED',
        revision: visit.round?.revision ?? 0,
        cycleId: visit.cycleId,
        canEdit:
          visit.round?.status === 'COMPLETED' &&
          !!settings?.roundEditWindowHours &&
          Date.now() <=
            visit.round.createdAt.getTime() +
              settings.roundEditWindowHours * 3600000 &&
          user.permissions.includes('rounds.manage_own') &&
          user.permissions.includes('visits.edit_own'),
        notes: visit.round?.notes ?? '',
        productIds: visit.products.map((p) => p.productId),
        type: visit.target.type,
        date: visit.completedAt
          ? dateInZone(visit.completedAt, visit.cycle.timezone)
          : null,
        areas: [],
        targets: [],
      };
      group.targets.push({ id: visit.targetId, name: visit.target.name });
      const recordedAreas = selectedAreas.get(visit.roundId) ?? [];
      const targetAreas = recordedAreas.length
        ? recordedAreas.flatMap((id) =>
            areaMap.has(id) ? [areaMap.get(id)!] : [],
          )
        : visit.target.locations
            .slice(0, 1)
            .map((l) => ({ id: l.areaId, name: l.area.name }));
      group.areas = [
        ...new Map(
          [...group.areas, ...targetAreas].map((a) => [a.id, a]),
        ).values(),
      ];
      groups.set(key, group);
    }
    return { items: [...groups.values()] };
  }

  async register(
    user: AuthUser,
    dto: RegisterRoundDto,
    edit?: { id: string; revision: number },
    attempt = 0,
  ): Promise<{ id: string; visitCount: number }> {
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          cycleId: dto.cycleId,
          type: dto.type,
          areaIds: [...dto.areaIds].sort(),
          targetIds: [...dto.targetIds].sort(),
          productIds: [...dto.productIds].sort(),
          visitDate: dto.visitDate,
          notes: dto.notes?.trim() || null,
        }),
      )
      .digest('hex');
    const replay = async (db: Prisma.TransactionClient) => {
      if (edit) {
        const previous = await db.auditLog.findFirst({
          where: {
            entityType: 'FieldRound',
            entityId: edit.id,
            actorId: user.id,
            organizationId: user.organizationId!,
            action: 'UPDATE',
            requestId: dto.clientRef,
          },
        });
        if (!previous) return null;
        if (
          (previous.afterData as { fingerprint?: string })?.fingerprint !==
          fingerprint
        )
          throw new ConflictException('معرّف التعديل مستخدم لبيانات أخرى.');
        return { id: edit.id, visitCount: dto.targetIds.length };
      }

      const round = await db.fieldRound.findUnique({
        where: { clientRef: dto.clientRef },
        include: { _count: { select: { visits: true } } },
      });
      if (!round) return null;
      if (
        round.repId !== user.id ||
        round.organizationId !== user.organizationId
      )
        throw new ConflictException('معرّف الطلب مستخدم.');
      const audit = await db.auditLog.findFirst({
        where: {
          entityId: round.id,
          entityType: 'FieldRound',
          actorId: user.id,
          action: 'CREATE',
        },
      });
      if (
        (audit?.afterData as { fingerprint?: string } | null)?.fingerprint !==
        fingerprint
      )
        throw new ConflictException('لا يمكن تغيير بيانات طلب سبق تسجيله.');
      return { id: round.id, visitCount: round._count.visits };
    };
    try {
      return await this.prisma.$transaction(
        async (db) => {
          const existing = await replay(db);
          if (existing) return existing;
          const policy = (await db.organizationSettings.findUnique({where:{organizationId:user.organizationId!}}))?.roundLocationPolicy ?? 'DISABLED';
          let registrationLocation: { status:string; latitude?:number; longitude?:number; accuracy?:number; capturedAt?:string; receivedAt:string; reason?:string } = {status:'DISABLED',receivedAt:new Date().toISOString()};
          if (!edit && policy !== 'DISABLED') {
            if (dto.latitude !== undefined && dto.longitude !== undefined && dto.accuracy !== undefined && dto.locationCapturedAt) {
              const captured = new Date(dto.locationCapturedAt).getTime();
              if (!Number.isFinite(captured) || Date.now()-captured > 300000 || captured-Date.now()>60000) throw new BadRequestException('الموقع قديم؛ أعد تحديد موقعك الحالي.');
              registrationLocation = {status:'CAPTURED',latitude:dto.latitude,longitude:dto.longitude,accuracy:dto.accuracy,capturedAt:dto.locationCapturedAt,receivedAt:new Date().toISOString()};
            } else {
              if (policy === 'REQUIRED') throw new BadRequestException('تحديد الموقع الحالي إلزامي لتسجيل الجولة.');
              if (!dto.locationReason?.trim()) throw new BadRequestException('حدد سبب التسجيل بدون موقع.');
              registrationLocation = {status:'OMITTED',reason:dto.locationReason.trim(),receivedAt:new Date().toISOString()};
            }
          }
          const original = edit
            ? await db.fieldRound.findFirst({
                where: {
                  id: edit.id,
                  repId: user.id,
                  organizationId: user.organizationId!,
                  status: 'COMPLETED',
                },
                include: {
                  visits: {
                    include: {
                      products: true,
                      teamCredits: { include: { products: true } },
                    },
                  },
                },
              })
            : null;
          if (edit) {
            if (
              !user.permissions.includes('rounds.manage_own') ||
              !user.permissions.includes('visits.edit_own') ||
              !original
            )
              throw new ForbiddenException('الجولة غير متاحة للتعديل.');
            const settings = await db.organizationSettings.findUnique({
              where: { organizationId: user.organizationId! },
            });
            const hours = settings?.roundEditWindowHours ?? 0;
            if (
              !hours ||
              Date.now() > original.createdAt.getTime() + hours * 3600000
            )
              throw new ForbiddenException('انتهت مهلة تعديل الجولة.');
            if (original.revision !== edit.revision)
              throw new ConflictException(
                'تم تعديل الجولة من جلسة أخرى. أعد فتحها.',
              );
            if (original.cycleId !== dto.cycleId)
              throw new BadRequestException(
                'لا يمكن نقل الجولة إلى سايكل آخر.',
              );
          }
          const profile = await this.context(user, db);
          if (!profile || profile.cycleId !== dto.cycleId)
            throw new BadRequestException(
              'لا يوجد تكليف فعال لهذا السايكل. أعد تحميل البيانات.',
            );
          const date = visitInstant(dto.visitDate, profile.cycle.timezone);
          if (
            dto.visitDate > dateInZone(new Date(), profile.cycle.timezone) ||
            dto.visitDate < profile.cycle.startsAt.toISOString().slice(0, 10) ||
            dto.visitDate > profile.cycle.endsAt.toISOString().slice(0, 10)
          )
            throw new BadRequestException(
              'اختر تاريخاً ضمن السايكل وليس في المستقبل.',
            );
          const [areas, targets, products] = await Promise.all([
            db.repCycleArea.count({
              where: {
                repCycleProfileId: profile.id,
                areaId: { in: dto.areaIds },
                area: { organizationId: user.organizationId!, deletedAt: null },
              },
            }),
            db.repCycleTarget.count({
              where: {
                repCycleProfileId: profile.id,
                targetId: { in: dto.targetIds },
                target: {
                  organizationId: user.organizationId!,
                  type: dto.type,
                  isActive: true,
                  deletedAt: null,
                  locations: { some: { areaId: { in: dto.areaIds } } },
                },
              },
            }),
            db.repCycleProduct.count({
              where: {
                repCycleProfileId: profile.id,
                productId: { in: dto.productIds },
                product: {
                  organizationId: user.organizationId!,
                  isActive: true,
                  deletedAt: null,
                },
              },
            }),
          ]);
          if (
            areas !== dto.areaIds.length ||
            targets !== dto.targetIds.length ||
            products !== dto.productIds.length
          )
            throw new ForbiddenException(
              'تتضمن الجولة جهات أو مناطق أو أصنافاً غير مسندة إليك.',
            );
          const scope = await loadTeamScope(
            db,
            profile.id,
            user.organizationId!,
            dto.visitDate,
          );
          if (!scope.configured)
            throw new ForbiddenException(
              'تكليف الفريق غير مكتمل. يجب إكمال ربط المناطق والجهات والأصناف قبل تسجيل الجولة.',
            );
          const credits = new Map(
            dto.targetIds.map((targetId) => [
              targetId,
              creditsForTarget(scope, targetId, dto.areaIds, dto.productIds),
            ]),
          );
          if (scope.configured) {
            const allowedAreas = new Set(
              scope.periods.flatMap((p) => p.scopeAreas.map((a) => a.areaId)),
            );
            const allowedProducts = new Set(
              scope.periods.flatMap((p) =>
                p.scopeProducts.map((p) => p.productId),
              ),
            );
            if (
              dto.areaIds.some((id) => !allowedAreas.has(id)) ||
              dto.productIds.some((id) => !allowedProducts.has(id)) ||
              dto.targetIds.some((id) => !credits.get(id)?.length)
            )
              throw new ForbiddenException(
                'الجهات أو المناطق أو الأصناف خارج تكليفات فرقك في تاريخ الزيارة.',
              );
          }
          const shared = {
            organizationId: user.organizationId!,
            cycleId: profile.cycleId,
            repId: user.id,
            repCycleProfileId: profile.id,
            notes: dto.notes?.trim() || null,
          };
          const round = original
            ? await db.fieldRound.update({
                where: { id: original.id, revision: edit!.revision },
                data: {
                  startedAt: date,
                  endedAt: date,
                  notes: shared.notes,
                  revision: { increment: 1 },
                },
              })
            : await db.fieldRound.create({
                data: {
                  ...shared,
                  clientRef: dto.clientRef,
                  registrationLocation,
                  status: 'COMPLETED',
                  startedAt: date,
                  endedAt: date,
                },
              });
          if (original) {
            await db.visitTeamCredit.deleteMany({
              where: { visit: { roundId: round.id } },
            });
            await db.visitProduct.deleteMany({
              where: { visit: { roundId: round.id } },
            });
            await db.visit.updateMany({
              where: { roundId: round.id },
              data: { status: 'CANCELLED' },
            });
          }
          for (const targetId of dto.targetIds) {
            const previous = original?.visits.find(
              (v) => v.targetId === targetId,
            );
            const data = {
              ...shared,
              targetId,
              roundId: round.id,
              status: 'COMPLETED' as const,
              startedAt: date,
              completedAt: date,
              teamCredits: { create: credits.get(targetId) ?? [] },
              products: {
                create: dto.productIds.map((productId) => ({ productId })),
              },
            };
            if (previous)
              await db.visit.update({ where: { id: previous.id }, data });
            else await db.visit.create({ data });
          }
          await db.auditLog.create({
            data: {
              organizationId: user.organizationId,
              actorId: user.id,
              action: original ? 'UPDATE' : 'CREATE',
              requestId: edit ? dto.clientRef : null,
              beforeData: original
                ? JSON.parse(JSON.stringify(original))
                : undefined,
              entityType: 'FieldRound',
              entityId: round.id,
              afterData: {
                fingerprint,
                type: dto.type,
                areaIds: dto.areaIds,
                targetIds: dto.targetIds,
                productIds: dto.productIds,
                visitDate: dto.visitDate,
              },
            },
          });
          return { id: round.id, visitCount: dto.targetIds.length };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 15000,
        },
      );
    } catch (error) {
      if (
        isWriteConflict(error) || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      ) {
        const existing = await replay(this.prisma);
        if (existing) return existing;
        if (isWriteConflict(error) && attempt < 6) {
          await new Promise(resolve => setTimeout(resolve, Math.min(100 * 2 ** attempt, 2000) * (0.5 + Math.random())));
          return this.register(user, dto, edit, attempt + 1);
        }
        throw new ConflictException('تزامن طلب آخر. أعد المحاولة.');
      }
      throw error;
    }
  }
}
