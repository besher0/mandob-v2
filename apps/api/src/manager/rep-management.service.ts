import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { dateInZone } from '../rep/rep-workspace.service.js';
import type { CreateRepDto, RepAssignmentDto } from './rep-management.dto.js';
@Injectable()
export class RepManagementService {
  constructor(private readonly prisma: PrismaService) {}
  private companyAccess(user: AuthUser) { return user.roles.includes("NATIONAL_MANAGER") && user.permissions.includes("users.manage"); }
  private managed(user: AuthUser) {
    const now = new Date();
    return {
      organizationId: user.organizationId!,
      isActive: true,
      deletedAt: null,
      members: this.companyAccess(user) ? undefined : {
        some: {
          userId: user.id,
          isManager: true,
          startedAt: { lte: now },
          OR: [{ endedAt: null }, { endedAt: { gt: now } }],
        },
      },
    };
  }
  private async check(user: AuthUser, write = false) {
    if (this.companyAccess(user) && !(await this.prisma.user.findFirst({where:{id:user.id,organizationId:user.organizationId!,status:"ACTIVE",deletedAt:null,roles:{some:{role:{code:"NATIONAL_MANAGER",permissions:{some:{permission:{code:"users.manage"}}}}}}}}))) throw new ForbiddenException("صلاحيات إدارة الشركة غير متاحة.");
    if (
      !user.organizationId ||
      !user.permissions.includes(write ? 'users.manage_own' : 'users.view')
    )
      throw new ForbiddenException('ليس لديك صلاحية إدارة المندوبين.');
  }
  private async cycle(db: Prisma.TransactionClient, user: AuthUser) {
    const cycles = await db.cycle.findMany({
      where: { organizationId: user.organizationId!, status: 'ACTIVE' },
      include: { classRules: true, provinceClassRules: true },
      orderBy: { startsAt: 'desc' },
    });
    const c = cycles.find((c) => {
      const day = dateInZone(new Date(), c.timezone);
      return (
        c.startsAt.toISOString().slice(0, 10) <= day &&
        c.endsAt.toISOString().slice(0, 10) >= day
      );
    });
    if (!c) throw new BadRequestException('لا يوجد سايكل فعال.');
    return c;
  }
  async options(user: AuthUser, repId?: string) {
    await this.check(user);
    const teams = await this.prisma.team.findMany({
      where: this.managed(user),
      include: {
        specialties: { include: { specialty: true } },
        products: { include: { product: true } },
      },
      orderBy: { name: 'asc' },
    });
    const areas = await this.prisma.area.findMany({
      where: {
        organizationId: user.organizationId!,
        provinceId: {
          in: teams.flatMap((t) => (t.provinceId ? [t.provinceId] : [])),
        },
        deletedAt: null,
      },
      select: { id: true, name: true, provinceId: true },
      orderBy: { name: 'asc' },
    });
    const cycle = await this.cycle(this.prisma, user);
    let rep = null;
    if (repId) {
      const profile = await this.prisma.repCycleProfile.findFirst({
        where: {
          repId,
          organizationId: user.organizationId!,
          cycleId: cycle.id,
          isActive: true,
          teamPeriods: { some: { team: this.managed(user) } },
        },
        include: {
          rep: { select: { id: true, name: true, username: true } },
          areas: true,
          products: true,
          specialties: true,
          teamPeriods: {
            orderBy: { startedAt: 'desc' },
            include: {
              scopeSpecialties: true,
              scopeAreas: true,
              scopeProducts: true,
              team: {
                include: {
                  members: { where: { isManager: true, endedAt: null } },
                },
              },
            },
          },
        },
      });
      if (!profile) throw new ForbiddenException('المندوب خارج نطاقك.');
      const shared = !this.companyAccess(user) && profile.teamPeriods.some((p) =>
        p.team.members.some((m) => m.userId !== user.id),
      );
      rep = {
        ...profile.rep,
        dailyVisitTarget: profile.dailyVisitTarget,
        shared,
        assignments: profile.teamPeriods
          .filter(
            (p) =>
              teams.some((t) => t.id === p.teamId) &&
              (!p.endedAt ||
                p.endedAt >=
                  new Date(
                    `${dateInZone(new Date(), cycle.timezone)}T00:00:00Z`,
                  )),
          )
          .map((p) => ({
            teamId: p.teamId,
            areaIds: p.scopeConfigured
              ? p.scopeAreas.map((a) => a.areaId)
              : profile.areas.map((a) => a.areaId),
            productIds: p.scopeConfigured
              ? p.scopeProducts.map((a) => a.productId)
              : profile.products.map((a) => a.productId),
            specialtyIds: p.scopeSpecialties.length
              ? p.scopeSpecialties.map((s) => s.specialtyId)
              : teams
                  .find((t) => t.id === p.teamId)!
                  .specialties.map((s) => s.specialtyId),
          })),
      };
    }
    return {
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        provinceId: t.provinceId,
        specialties: t.specialties
          .filter((s) => !s.specialty.deletedAt)
          .map((s) => ({ id: s.specialtyId, name: s.specialty.name })),
        products: t.products
          .filter((p) => p.product.isActive && !p.product.deletedAt)
          .map((p) => ({ id: p.productId, name: p.product.name })),
      })),
      areas,
      rep,
    };
  }
  async create(user: AuthUser, dto: CreateRepDto) {
    await this.check(user, true);
    if (Buffer.byteLength(dto.password, 'utf8') > 72)
      throw new BadRequestException('كلمة المرور تتجاوز الحجم المسموح.');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.save(user, dto, undefined, passwordHash);
  }
  async update(user: AuthUser, repId: string, dto: RepAssignmentDto) {
    await this.check(user, true);
    return this.save(user, dto, repId);
  }
  private async save(
    user: AuthUser,
    dto: RepAssignmentDto,
    repId?: string,
    passwordHash?: string,
  ) {
    try {
      return await this.prisma.$transaction(
        async (db) => {
          const team = await db.team.findFirst({
            where: { id: dto.teamId, ...this.managed(user) },
            include: { specialties: true, products: true },
          });
          if (!team?.provinceId)
            throw new ForbiddenException(
              'الفريق خارج نطاقك أو غير مرتبط بمحافظة.',
            );
          const cycle = await this.cycle(db, user);
          const today = new Date(
            `${dateInZone(new Date(), cycle.timezone)}T00:00:00Z`,
          );
          let effectiveOn = today;
          if (!dto.name.trim())
            throw new BadRequestException('اسم المندوب مطلوب.');
          if (
            dto.specialtyIds.some(
              (id) => !team.specialties.some((s) => s.specialtyId === id),
            ) ||
            dto.productIds.some(
              (id) => !team.products.some((p) => p.productId === id),
            )
          )
            throw new BadRequestException(
              'يجب اختيار اختصاصات وأصناف من الفريق المحدد.',
            );
          const areaCount = await db.area.count({
            where: {
              id: { in: dto.areaIds },
              organizationId: user.organizationId!,
              provinceId: team.provinceId,
              deletedAt: null,
            },
          });
          const productCount = await db.product.count({
            where: {
              id: { in: dto.productIds },
              organizationId: user.organizationId!,
              isActive: true,
              deletedAt: null,
            },
          });
          const specialtyCount = await db.specialty.count({
            where: {
              id: { in: dto.specialtyIds },
              organizationId: user.organizationId!,
              deletedAt: null,
            },
          });
          if (
            areaCount !== dto.areaIds.length ||
            productCount !== dto.productIds.length ||
            specialtyCount !== dto.specialtyIds.length
          )
            throw new BadRequestException(
              'مناطق أو أصناف أو اختصاصات غير متاحة.',
            );
          const targets = await db.fieldTarget.findMany({
            where: {
              organizationId: user.organizationId!,
              isActive: true,
              deletedAt: null,
              locations: { some: { areaId: { in: dto.areaIds } } },
              OR: [
                { type: { in: ['PHARMACY', 'HOSPITAL'] } },
                {
                  type: 'DOCTOR',
                  specialties: {
                    some: { specialtyId: { in: dto.specialtyIds } },
                  },
                },
              ],
            },
            include: { targetClass: true },
          });
          const quotas = targets.map((t) => {
            const rule =
              cycle.provinceClassRules.find(
                (r) =>
                  r.provinceId === team.provinceId &&
                  r.targetClassId === t.targetClassId,
              ) ??
              cycle.classRules.find((r) => r.targetClassId === t.targetClassId);
            if (
              !t.targetClass ||
              !t.targetClass.isActive ||
              t.targetClass.organizationId !== user.organizationId ||
              !rule
            )
              throw new BadRequestException(
                `الجهة «${t.name}» تحتاج تصنيفاً وقاعدة زيارات في السايكل قبل التكليف.`,
              );
            return {
              targetId: t.id,
              targetClassId: t.targetClass.id,
              requiredVisits: rule.requiredVisits,
            };
          });
          let profile = repId
            ? await db.repCycleProfile.findFirst({
                where: {
                  repId,
                  organizationId: user.organizationId!,
                  cycleId: cycle.id,
                  isActive: true,
                  rep: {
                    organizationId: user.organizationId!,
                    status: 'ACTIVE',
                    deletedAt: null,
                  },
                  teamPeriods: { some: { teamId: team.id } },
                },
                include: {
                  rep: { select: { name: true } },
                  teamPeriods: {
                    include: {
                      team: {
                        include: {
                          members: {
                            where: { isManager: true, endedAt: null },
                          },
                        },
                      },
                      scopeTargets: {
                        include: { _count: { select: { credits: true } } },
                      },
                    },
                  },
                },
              })
            : null;
          if (repId && !profile)
            throw new ForbiddenException('المندوب غير مسند لهذا الفريق.');
          if (profile) {
            const overlapping = profile.teamPeriods.filter(
              (p) => !p.endedAt || p.endedAt >= today,
            );
            if (overlapping.some((p) => p.team.provinceId !== team.provinceId))
              throw new ConflictException(
                'تكليفات المندوب يجب أن تكون ضمن المحافظة نفسها.',
              );
            const shared = !this.companyAccess(user) && overlapping.some((p) =>
              p.team.members.some((m) => m.userId !== user.id),
            );
            if (
              shared &&
              (dto.name.trim() !== profile.rep.name ||
                dto.dailyVisitTarget !== profile.dailyVisitTarget)
            )
              throw new ForbiddenException(
                'الاسم والهدف اليومي المشترك يُعدّلان من إدارة الشركة.',
              );
            const own = overlapping.filter((p) => p.teamId === team.id);
            if (own.some((p) => p.startedAt > today))
              throw new ConflictException(
                'هناك تعديل تكليف مجدول لهذا الفريق. انتظر سريانه قبل تعديل جديد.',
              );
            const hasCredits = own.some((p) =>
              p.scopeTargets.some((s) => s._count.credits > 0),
            );
            if (hasCredits) {
              effectiveOn = new Date(today);
              effectiveOn.setUTCDate(effectiveOn.getUTCDate() + 1);
              if (effectiveOn > cycle.endsAt)
                throw new ConflictException(
                  'السايكل ينتهي اليوم. طبّق التعديل في السايكل التالي.',
                );
              await db.repCycleTeamPeriod.updateMany({
                where: { id: { in: own.map((p) => p.id) } },
                data: { endedAt: today },
              });
            } else {
              const ids = own.map((p) => p.id);
              await db.teamScopeTarget.deleteMany({
                where: { teamPeriodId: { in: ids } },
              });
              await db.teamScopeProduct.deleteMany({
                where: { teamPeriodId: { in: ids } },
              });
              await db.teamScopeArea.deleteMany({
                where: { teamPeriodId: { in: ids } },
              });
              await db.repCycleTeamPeriod.deleteMany({
                where: { id: { in: ids } },
              });
            }
            await db.user.update({
              where: { id: repId! },
              data: { name: dto.name.trim() },
            });
            await db.repCycleProfile.update({
              where: { id: profile.id },
              data: { dailyVisitTarget: dto.dailyVisitTarget },
            });
          } else {
            const role = await db.role.findUnique({ where: { code: 'REP' } });
            if (!role)
              throw new BadRequestException('دور المندوب غير مهيأ في النظام.');
            const account = await db.user.create({
              data: {
                organizationId: user.organizationId!,
                name: dto.name.trim(),
                username: (dto as CreateRepDto).username.trim(),
                passwordHash: passwordHash!,
                roles: { create: { roleId: role.id } },
                repProfile: {
                  create: {
                    organizationId: user.organizationId!,
                    dailyVisitTarget: dto.dailyVisitTarget,
                    leaveApproverId: user.id,
                  },
                },
              },
            });
            repId = account.id;
            profile = await db.repCycleProfile.create({
              data: {
                organizationId: user.organizationId!,
                cycleId: cycle.id,
                repId,
                dailyVisitTarget: dto.dailyVisitTarget,
              },
              include: {
                rep: { select: { name: true } },
                teamPeriods: {
                  include: {
                    team: {
                      include: {
                        members: { where: { isManager: true, endedAt: null } },
                      },
                    },
                    scopeTargets: {
                      include: { _count: { select: { credits: true } } },
                    },
                  },
                },
              },
            });
          }
          // Global rows are the union of assignment history; active access is governed by team snapshots.
          await db.repCycleArea.createMany({
            data: dto.areaIds.map((areaId) => ({
              repCycleProfileId: profile!.id,
              areaId,
            })),
            skipDuplicates: true,
          });
          await db.repCycleProduct.createMany({
            data: dto.productIds.map((productId) => ({
              repCycleProfileId: profile!.id,
              productId,
            })),
            skipDuplicates: true,
          });
          await db.repCycleSpecialty.createMany({
            data: dto.specialtyIds.map((specialtyId) => ({
              repCycleProfileId: profile!.id,
              specialtyId,
            })),
            skipDuplicates: true,
          });
          const assigned = [];
          for (const q of quotas) {
            assigned.push(
              await db.repCycleTarget.upsert({
                where: {
                  repCycleProfileId_targetId: {
                    repCycleProfileId: profile!.id,
                    targetId: q.targetId,
                  },
                },
                create: { repCycleProfileId: profile!.id, ...q },
                update: {},
              }),
            );
          }
          await db.repCycleTeamPeriod.create({
            data: {
              teamId: team.id,
              repCycleProfileId: profile.id,
              startedAt: effectiveOn,
              endedAt: cycle.endsAt,
              scopeConfigured: true,
              scopeSpecialties: {
                create: dto.specialtyIds.map((specialtyId) => ({
                  specialtyId,
                })),
              },
              scopeAreas: { create: dto.areaIds.map((areaId) => ({ areaId })) },
              scopeProducts: {
                create: dto.productIds.map((productId) => ({ productId })),
              },
              scopeTargets: {
                create: assigned.map((t) => ({
                  repCycleTargetId: t.id,
                  requiredVisits: t.requiredVisits,
                })),
              },
            },
          });
          if (
            !(await db.teamMember.findFirst({
              where: { teamId: team.id, userId: repId, endedAt: null },
            }))
          )
            await db.teamMember.create({
              data: { teamId: team.id, userId: repId! },
            });
          await db.auditLog.create({
            data: {
              organizationId: user.organizationId!,
              actorId: user.id,
              action: passwordHash ? 'CREATE' : 'UPDATE',
              entityType: 'RepCycleProfile',
              entityId: profile.id,
              afterData: {
                repId,
                teamId: team.id,
                areaIds: dto.areaIds,
                productIds: dto.productIds,
                specialtyIds: dto.specialtyIds,
                dailyVisitTarget: dto.dailyVisitTarget,
                effectiveOn: effectiveOn.toISOString().slice(0, 10),
              },
            },
          });
          return {
            id: repId,
            effectiveOn: effectiveOn.toISOString().slice(0, 10),
            targetCount: assigned.length,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002')
          throw new ConflictException(
            'اسم المستخدم مستخدم أو هناك بيانات مكررة.',
          );
        if (e.code === 'P2034')
          throw new ConflictException(
            'حدث تعديل متزامن. حدّث الصفحة وأعد المحاولة.',
          );
      }
      throw e;
    }
  }
}
