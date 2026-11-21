import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { dateInZone } from '../rep/rep-workspace.service.js';
import type {
  ManagedTeamDto,
  CreateManagedTeamDto,
  ManagedTeamRepsDto,
} from './team-management.dto.js';

@Injectable()
export class TeamManagementService {
  constructor(private readonly prisma: PrismaService) {}
  private managed(user: AuthUser) {
    const now = new Date();
    return {
      organizationId: user.organizationId!,
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
    };
  }
  private async authorize(
    db: Prisma.TransactionClient,
    user: AuthUser,
    teamId: string,
    permission: string,
  ) {
    if (!user.organizationId || !user.permissions.includes(permission))
      throw new ForbiddenException('ليس لديك صلاحية إدارة هذا الفريق.');
    const companyAccess = user.roles.includes('NATIONAL_MANAGER') && user.permissions.includes('teams.manage') && ['teams.view', 'teams.configure_own'].includes(permission);
    if (companyAccess && !await db.user.findFirst({where:{id:user.id,organizationId:user.organizationId,status:'ACTIVE',deletedAt:null,roles:{some:{role:{code:'NATIONAL_MANAGER',permissions:{some:{permission:{code:'teams.manage'}}}}}}},select:{id:true}}))
      throw new ForbiddenException('صلاحيات إدارة الشركة غير متاحة.');
    const team = await db.team.findFirst({
      where: { id: teamId, ...this.managed(user), ...(companyAccess ? {members:undefined} : {}) },
      include: {
        specialties: {
          where: {
            specialty: { organizationId: user.organizationId, deletedAt: null },
          },
        },
        products: {
          where: {
            product: {
              organizationId: user.organizationId,
              isActive: true,
              deletedAt: null,
            },
          },
        },
      },
    });
    if (!team?.provinceId)
      throw new ForbiddenException('الفريق خارج نطاقك أو غير مرتبط بمحافظة.');
    return team;
  }
  private async context(
    db: Prisma.TransactionClient,
    user: AuthUser,
    provinceId: string,
  ) {
    const cycles = await db.cycle.findMany({
      where: { organizationId: user.organizationId!, status: 'ACTIVE' },
      orderBy: { startsAt: 'desc' },
    });
    const cycle = cycles.find((c) => {
      const today = dateInZone(new Date(), c.timezone);
      return (
        c.startsAt.toISOString().slice(0, 10) <= today &&
        c.endsAt.toISOString().slice(0, 10) >= today
      );
    });
    if (!cycle)
      throw new BadRequestException('لا يوجد سايكل فعال لإدارة التكليفات.');
    const profiles = await db.repCycleProfile.findMany({
      where: {
        organizationId: user.organizationId!,
        cycleId: cycle.id,
        isActive: true,
        rep: {
          organizationId: user.organizationId!,
          status: 'ACTIVE',
          deletedAt: null,
        },
        OR: [
          {
            teamPeriods: {
              some: { team: { ...this.managed(user), provinceId } },
            },
          },
          {
            rep: {
              teamMemberships: {
                some: {
                  isManager: false,
                  team: { ...this.managed(user), provinceId },
                },
              },
            },
          },
        ],
      },
      include: {
        rep: { select: { id: true, name: true } },
        areas: {
          where: {
            area: {
              organizationId: user.organizationId!,
              provinceId,
              deletedAt: null,
            },
          },
          include: { area: { select: { id: true, name: true } } },
        },
        products: true,
        targets: {
          include: {
            target: { include: { specialties: true, locations: true } },
          },
        },
        teamPeriods: {
          where: {
            startedAt: { lte: cycle.endsAt },
            OR: [
              { endedAt: null },
              {
                endedAt: {
                  gte: new Date(
                    `${dateInZone(new Date(), cycle.timezone)}T00:00:00Z`,
                  ),
                },
              },
            ],
          },
          include: {
            scopeTargets: {
              include: { _count: { select: { credits: true } } },
            },
          },
        },
      },
      orderBy: { rep: { name: 'asc' } },
    });
    return { cycle, profiles };
  }
  private async creationProvinces(
    db: Prisma.TransactionClient,
    user: AuthUser,
  ) {
    if (!user.organizationId || !user.permissions.includes('teams.create_own'))
      throw new ForbiddenException('ليست لديك صلاحية إنشاء فريق.');
    const managed = await db.team.findMany({
      where: this.managed(user),
      select: { provinceId: true },
    });
    return db.province.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        id: {
          in: managed.flatMap((t) => (t.provinceId ? [t.provinceId] : [])),
        },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
  async createOptions(user: AuthUser) {
    const provinces = await this.creationProvinces(this.prisma, user);
    const [specialties, products] = await Promise.all([
      this.prisma.specialty.findMany({
        where: { organizationId: user.organizationId!, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.findMany({
        where: {
          organizationId: user.organizationId!,
          deletedAt: null,
          isActive: true,
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      provinces,
      specialties,
      products,
      team: { id: '', name: '', specialtyIds: [], productIds: [] },
    };
  }
  async create(user: AuthUser, dto: CreateManagedTeamDto) {
    return this.transaction(async (db) => {
      const provinces = await this.creationProvinces(db, user);
      if (!provinces.some((p) => p.id === dto.provinceId))
        throw new ForbiddenException('المحافظة خارج نطاقك.');
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('اسم الفريق مطلوب.');
      const specialties = await db.specialty.count({
        where: {
          id: { in: dto.specialtyIds },
          organizationId: user.organizationId!,
          deletedAt: null,
        },
      });
      const products = await db.product.count({
        where: {
          id: { in: dto.productIds },
          organizationId: user.organizationId!,
          deletedAt: null,
          isActive: true,
        },
      });
      if (
        specialties !== dto.specialtyIds.length ||
        products !== dto.productIds.length
      )
        throw new BadRequestException('اختصاص أو صنف غير متاح ضمن الشركة.');
      const team = await db.team.create({
        data: {
          organizationId: user.organizationId!,
          provinceId: dto.provinceId,
          name,
          members: { create: { userId: user.id, isManager: true } },
          specialties: {
            create: dto.specialtyIds.map((specialtyId) => ({ specialtyId })),
          },
          products: {
            create: dto.productIds.map((productId) => ({ productId })),
          },
        },
      });
      await db.auditLog.create({
        data: {
          organizationId: user.organizationId!,
          actorId: user.id,
          action: 'CREATE',
          entityType: 'Team',
          entityId: team.id,
          afterData: {
            name,
            provinceId: dto.provinceId,
            specialtyIds: dto.specialtyIds,
            productIds: dto.productIds,
          },
        },
      });
      return { id: team.id };
    });
  }
  async options(user: AuthUser, teamId: string) {
    const team = await this.authorize(this.prisma, user, teamId, 'teams.view');
    const [specialties, products] = await Promise.all([
      this.prisma.specialty.findMany({
        where: { organizationId: user.organizationId!, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.findMany({
        where: {
          organizationId: user.organizationId!,
          isActive: true,
          deletedAt: null,
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      team: {
        id: team.id,
        name: team.name,
        specialtyIds: team.specialties.map((s) => s.specialtyId),
        productIds: team.products.map((p) => p.productId),
      },
      specialties,
      products,
    };
  }
  async reps(user: AuthUser, teamId: string) {
    const team = await this.authorize(this.prisma, user, teamId, 'teams.view');
    const { cycle, profiles } = await this.context(
      this.prisma,
      user,
      team.provinceId!,
    );
    return {
      cycle: { id: cycle.id, name: cycle.name },
      items: profiles.map((p) => {
        const periods = p.teamPeriods.filter((t) => t.teamId === teamId);
        return {
          id: p.id,
          rep: p.rep,
          areas: p.areas.map((a) => a.area),
          selected: periods.length > 0,
          configured: periods.some((t) => t.scopeConfigured),
          locked: periods.some((t) =>
            t.scopeTargets.some((s) => s._count.credits > 0),
          ),
        };
      }),
    };
  }
  private async transaction<T>(
    action: (db: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(action, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2034', 'P2002'].includes(e.code)
      )
        throw new ConflictException(
          'تعارض التعديل مع بيانات موجودة أو تعديل متزامن. حدّث الصفحة وأعد المحاولة.',
        );
      throw e;
    }
  }
  async update(user: AuthUser, teamId: string, dto: ManagedTeamDto) {
    return this.transaction(async (db) => {
      const team = await this.authorize(
        db,
        user,
        teamId,
        'teams.configure_own',
      );
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('اسم الفريق مطلوب.');
      const specialties = await db.specialty.count({
        where: {
          id: { in: dto.specialtyIds },
          organizationId: user.organizationId!,
          deletedAt: null,
        },
      });
      const products = await db.product.count({
        where: {
          id: { in: dto.productIds },
          organizationId: user.organizationId!,
          isActive: true,
          deletedAt: null,
        },
      });
      if (
        specialties !== dto.specialtyIds.length ||
        products !== dto.productIds.length
      )
        throw new BadRequestException('اختصاص أو صنف غير متاح ضمن الشركة.');
      const changed =
        team.specialties
          .map((s) => s.specialtyId)
          .sort()
          .join() !== [...dto.specialtyIds].sort().join() ||
        team.products
          .map((p) => p.productId)
          .sort()
          .join() !== [...dto.productIds].sort().join();
      // Existing snapshots remain immutable. Editing the team config applies to new assignments only.
      await db.team.update({
        where: { id: team.id },
        data: {
          name,
          ...(changed
            ? {
                specialties: {
                  deleteMany: {},
                  create: dto.specialtyIds.map((specialtyId) => ({
                    specialtyId,
                  })),
                },
                products: {
                  deleteMany: {},
                  create: dto.productIds.map((productId) => ({ productId })),
                },
              }
            : {}),
        },
      });
      await db.auditLog.create({
        data: {
          organizationId: user.organizationId!,
          actorId: user.id,
          action: 'UPDATE',
          entityType: 'Team',
          entityId: team.id,
          beforeData: {
            name: team.name,
            specialtyIds: team.specialties.map((s) => s.specialtyId),
            productIds: team.products.map((p) => p.productId),
          },
          afterData: {
            name,
            specialtyIds: dto.specialtyIds,
            productIds: dto.productIds,
          },
        },
      });
      return { id: team.id };
    });
  }
  async saveReps(user: AuthUser, teamId: string, dto: ManagedTeamRepsDto) {
    return this.transaction(async (db) => {
      const team = await this.authorize(db, user, teamId, 'teams.assign_own');
      const { cycle, profiles } = await this.context(
        db,
        user,
        team.provinceId!,
      );
      const ids = new Set(dto.repCycleProfileIds);
      if (
        dto.repCycleProfileIds.some((id) => !profiles.some((p) => p.id === id))
      )
        throw new ForbiddenException('أحد المندوبين خارج نطاق فرقك.');
      const today = new Date(
        `${dateInZone(new Date(), cycle.timezone)}T00:00:00Z`,
      );
      let configured = 0;
      for (const profile of profiles) {
        const own = profile.teamPeriods.filter((p) => p.teamId === team.id);
        if (!ids.has(profile.id)) {
          if (own.some((p) => p.scopeTargets.some((s) => s._count.credits > 0)))
            throw new ConflictException(
              'لا يمكن إزالة تكليف له زيارات مسجلة. يجب إنهاؤه ضمن إدارة الفترات دون حذف تاريخه.',
            );
          if (own.length) {
            const periodIds = own.map((p) => p.id);
            await db.teamScopeTarget.deleteMany({
              where: { teamPeriodId: { in: periodIds } },
            });
            await db.teamScopeProduct.deleteMany({
              where: { teamPeriodId: { in: periodIds } },
            });
            await db.teamScopeArea.deleteMany({
              where: { teamPeriodId: { in: periodIds } },
            });
            await db.repCycleTeamPeriod.deleteMany({
              where: { id: { in: own.map((p) => p.id) } },
            });
            await db.teamMember.updateMany({
              where: {
                teamId: team.id,
                userId: profile.repId,
                isManager: false,
                endedAt: null,
              },
              data: { endedAt: new Date() },
            });
          }
          continue;
        }
        if (own.some((p) => p.scopeConfigured)) continue;
        if (!profile.areas.length)
          throw new BadRequestException(
            `لم تُسند مناطق للمندوب ${profile.rep.name} ضمن محافظة الفريق.`,
          );
        const areaIds = profile.areas.map((a) => a.areaId);
        const targets = profile.targets.filter(
          (a) =>
            a.target.organizationId === user.organizationId &&
            a.target.isActive &&
            !a.target.deletedAt &&
            a.target.locations.some((l) => areaIds.includes(l.areaId)) &&
            (a.target.type !== 'DOCTOR' ||
              a.target.specialties.some((s) =>
                team.specialties.some((t) => t.specialtyId === s.specialtyId),
              )),
        );
        if (!targets.length)
          throw new BadRequestException(
            `لا توجد جهات مطابقة للمندوب ${profile.rep.name}. اضبط اختصاصات الفريق وتكليفات المناطق أولاً.`,
          );
        const productIds = profile.products
          .filter((p) => team.products.some((t) => t.productId === p.productId))
          .map((p) => p.productId);
        if (!productIds.length)
          throw new BadRequestException(
            `لا توجد أصناف مشتركة بين الفريق والمندوب ${profile.rep.name}.`,
          );
        const otherProvinces = await db.repCycleTeamPeriod.count({
          where: {
            repCycleProfileId: profile.id,
            startedAt: { lte: cycle.endsAt },
            OR: [{ endedAt: null }, { endedAt: { gte: today } }],
            team: { provinceId: { not: team.provinceId } },
          },
        });
        if (otherProvinces)
          throw new ConflictException(
            'التكليفات المتزامنة للمندوب يجب أن تكون ضمن المحافظة نفسها.',
          );
        if (own.length > 1)
          throw new ConflictException(
            'للمندوب عدة فترات سابقة. يجب مراجعة تكليفاته قبل التعديل.',
          );
        const data = {
          scopeConfigured: true,
          scopeAreas: { create: areaIds.map((areaId) => ({ areaId })) },
          scopeProducts: {
            create: productIds.map((productId) => ({ productId })),
          },
          scopeTargets: {
            create: targets.map((t) => ({
              repCycleTargetId: t.id,
              requiredVisits: t.requiredVisits,
            })),
          },
        };
        if (own[0])
          await db.repCycleTeamPeriod.update({
            where: { id: own[0].id },
            data,
          });
        else
          await db.repCycleTeamPeriod.create({
            data: {
              ...data,
              teamId: team.id,
              repCycleProfileId: profile.id,
              startedAt: today,
              endedAt: cycle.endsAt,
            },
          });
        if (
          !(await db.teamMember.findFirst({
            where: { teamId: team.id, userId: profile.repId, endedAt: null },
          }))
        )
          await db.teamMember.create({
            data: { teamId: team.id, userId: profile.repId },
          });
        configured++;
      }
      await db.auditLog.create({
        data: {
          organizationId: user.organizationId!,
          actorId: user.id,
          action: 'ASSIGN',
          entityType: 'Team',
          entityId: team.id,
          afterData: {
            cycleId: cycle.id,
            repCycleProfileIds: dto.repCycleProfileIds,
            configured,
          },
        },
      });
      return { configured };
    });
  }
}
