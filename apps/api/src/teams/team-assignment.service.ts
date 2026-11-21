import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { TeamAssignmentDto } from './dto/team-assignment.dto.js';

function calendarDate(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== day
  )
    throw new BadRequestException('تاريخ التكليف غير صالح.');
  return date;
}

@Injectable()
export class TeamAssignmentService {
  constructor(private readonly prisma: PrismaService) {}
  async create(user: AuthUser, dto: TeamAssignmentDto) {
    if (
      !user.organizationId ||
      !user.permissions.includes('teams.manage') ||
      !user.permissions.includes('cycles.configure')
    )
      throw new ForbiddenException(
        'تحتاج صلاحية إدارة الفرق وتكليفات السايكل ضمن الشركة.',
      );
    const organizationId = user.organizationId;
    const startsAt = calendarDate(dto.startsOn),
      endsAt = calendarDate(dto.endsOn);
    if (startsAt > endsAt)
      throw new BadRequestException('نهاية التكليف تسبق بدايته.');
    try {
      return await this.prisma.$transaction(
        async (db) => {
          const [profile, team] = await Promise.all([
            db.repCycleProfile.findFirst({
              where: {
                id: dto.repCycleProfileId,
                organizationId,
                isActive: true,
                rep: { organizationId, status: 'ACTIVE', deletedAt: null },
                cycle: { organizationId, status: { in: ['DRAFT', 'ACTIVE'] } },
              },
              include: { cycle: true },
            }),
            db.team.findFirst({
              where: {
                id: dto.teamId,
                organizationId,
                isActive: true,
                deletedAt: null,
              },
              include: {
                specialties: {
                  where: { specialty: { organizationId, deletedAt: null } },
                },
                products: {
                  where: {
                    product: {
                      organizationId,
                      isActive: true,
                      deletedAt: null,
                    },
                  },
                },
              },
            }),
          ]);
          if (!profile || !team)
            throw new ForbiddenException('التكليف أو الفريق خارج نطاق الشركة.');
          if (!team.provinceId)
            throw new BadRequestException('يجب ربط الفريق بمحافظة أولاً.');
          if (
            startsAt < profile.cycle.startsAt ||
            endsAt > profile.cycle.endsAt
          )
            throw new BadRequestException(
              'يجب أن تكون فترة التكليف ضمن السايكل.',
            );
          const areaCount = await db.repCycleArea.count({
            where: {
              repCycleProfileId: profile.id,
              areaId: { in: dto.areaIds },
              area: {
                organizationId,
                provinceId: team.provinceId,
                deletedAt: null,
              },
            },
          });
          if (areaCount !== dto.areaIds.length)
            throw new BadRequestException(
              'المناطق يجب أن تكون مسندة للمندوب وضمن محافظة الفريق.',
            );
          const overlaps = await db.repCycleTeamPeriod.findMany({
            where: {
              repCycleProfileId: profile.id,
              startedAt: { lte: endsAt },
              OR: [{ endedAt: null }, { endedAt: { gte: startsAt } }],
            },
            include: { team: true },
          });
          if (
            overlaps.some(
              (p) =>
                p.team.organizationId !== organizationId ||
                p.team.provinceId !== team.provinceId,
            )
          )
            throw new ConflictException(
              'التكليفات المتزامنة للمندوب يجب أن تكون ضمن المحافظة نفسها.',
            );
          const sameTeam = overlaps.filter((p) => p.teamId === team.id);
          if (sameTeam.some((p) => p.scopeConfigured) || sameTeam.length > 1)
            throw new ConflictException(
              'يوجد تكليف متداخل لهذا الفريق. لا تعدّل نطاقاً تاريخياً مستخدماً.',
            );
          const legacy = sameTeam[0];
          const assignments = await db.repCycleTarget.findMany({
            where: {
              repCycleProfileId: profile.id,
              target: {
                organizationId,
                isActive: true,
                deletedAt: null,
                locations: { some: { areaId: { in: dto.areaIds } } },
                OR: [
                  { type: { in: ['PHARMACY', 'HOSPITAL'] } },
                  {
                    type: 'DOCTOR',
                    specialties: {
                      some: {
                        specialtyId: {
                          in: team.specialties.map((s) => s.specialtyId),
                        },
                      },
                    },
                  },
                ],
              },
            },
            select: { id: true, requiredVisits: true },
          });
          if (!assignments.length)
            throw new BadRequestException(
              'لا توجد جهات مسندة مطابقة. اضبط اختصاصات الفريق وتكليفات المندوب أولاً.',
            );
          const products = await db.repCycleProduct.findMany({
            where: {
              repCycleProfileId: profile.id,
              productId: { in: team.products.map((p) => p.productId) },
            },
            select: { productId: true },
          });
          const data = {
            scopeConfigured: true,
            scopeAreas: { create: dto.areaIds.map((areaId) => ({ areaId })) },
            scopeProducts: { create: products },
            scopeTargets: {
              create: assignments.map((a) => ({
                repCycleTargetId: a.id,
                requiredVisits: a.requiredVisits,
              })),
            },
          };
          const reuseLegacy =
            legacy &&
            legacy.startedAt.getTime() === startsAt.getTime() &&
            legacy.endedAt?.getTime() === endsAt.getTime();
          const period = reuseLegacy
            ? await db.repCycleTeamPeriod.update({
                where: { id: legacy.id },
                data,
              })
            : await db.repCycleTeamPeriod.create({
                data: {
                  ...data,
                  startedAt: startsAt,
                  endedAt: endsAt,
                  repCycleProfileId: profile.id,
                  teamId: team.id,
                },
              });
          await db.auditLog.create({
            data: {
              organizationId,
              actorId: user.id,
              action: 'ASSIGN',
              entityType: 'RepCycleTeamPeriod',
              entityId: period.id,
              afterData: {
                areaIds: dto.areaIds,
                teamId: team.id,
                repCycleProfileId: profile.id,
                startsOn: dto.startsOn,
                endsOn: dto.endsOn,
                targetCount: assignments.length,
                productIds: products.map((p) => p.productId),
              },
            },
          });
          return {
            id: period.id,
            targetCount: assignments.length,
            productCount: products.length,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        throw new ConflictException('تغيّر تكليف متزامن. أعد المحاولة.');
      throw error;
    }
  }
}
