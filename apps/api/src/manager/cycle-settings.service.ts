import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  IsArray,
  IsOptional,
  IsBoolean,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { dateInZone } from '../rep/rep-workspace.service.js';
export class FrequencyDto {
  @IsUUID() id: string;
  @IsInt() @Min(1) @Max(365) requiredVisits: number;
}
export class WorkingDayDto {
  @IsInt() @Min(0) @Max(6) weekday: number;
  @IsBoolean() isWorking: boolean;
}
export class CycleSettingsDto {
  @IsOptional() @IsInt() @Min(0) @Max(720) roundEditWindowHours?: number;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) startsOn: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) endsOn: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => FrequencyDto)
  frequency: FrequencyDto[];
  @IsArray()
  @ArrayMinSize(7)
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WorkingDayDto)
  workingDays: WorkingDayDto[];
}
@Injectable()
export class CycleSettingsService {
  constructor(private readonly prisma: PrismaService) {}
  async save(user: AuthUser, id: string, dto: CycleSettingsDto) {
    if (!user.organizationId || !user.permissions.includes('cycles.configure'))
      throw new ForbiddenException(
        'تعديل السايكل يتطلب صلاحية صاحب الشركة أو من يفوضه.',
      );
    const start = new Date(dto.startsOn + 'T00:00:00Z'),
      end = new Date(dto.endsOn + 'T00:00:00Z');
    if (
      !Number.isFinite(+start) ||
      !Number.isFinite(+end) ||
      start.toISOString().slice(0, 10) !== dto.startsOn ||
      end.toISOString().slice(0, 10) !== dto.endsOn ||
      start > end ||
      (+end - +start) / 86400000 > 3660
    )
      throw new BadRequestException('مدة السايكل غير صالحة.');
    if (
      new Set(dto.frequency.map((r) => r.id)).size !== dto.frequency.length ||
      new Set(dto.workingDays.map((d) => d.weekday)).size !== 7 ||
      !dto.workingDays.some((d) => d.isWorking)
    )
      throw new BadRequestException('قواعد مكررة أو لا توجد أيام عمل.');
    try {
      return await this.prisma.$transaction(
        async (db) => {
          const cycle = await db.cycle.findFirst({
            where: { id, organizationId: user.organizationId! },
            include: {
              classRules: true,
              workingDays: true,
              _count: { select: { repProfiles: true, visits: true } },
            },
          });
          if (!cycle || !['ACTIVE', 'DRAFT'].includes(cycle.status))
            throw new ForbiddenException('السايكل غير متاح للتعديل.');
          const organizationSettings=await db.organizationSettings.findUnique({where:{organizationId:user.organizationId!}});
          if(organizationSettings?.cycleSchedule && (+start!==+cycle.startsAt||+end!==+cycle.endsAt))
            throw new ConflictException('مدة الفترات تُضبط من دورية السايكل؛ لا تغيّر تواريخ الفترة الحالية.');
          if (cycle._count.repProfiles && +start !== +cycle.startsAt)
            throw new ConflictException(
              'لا يمكن تغيير بداية سايكل له تكليفات.',
            );
          if (
            await db.cycle.count({
              where: {
                organizationId: user.organizationId!,
                id: { not: id },
                status: 'ACTIVE',
                startsAt: { lte: end },
                endsAt: { gte: start },
              },
            })
          )
            throw new ConflictException('المدة تتداخل مع سايكل فعال آخر.');
          if (
            await db.repCycleTeamPeriod.count({
              where: {
                repCycleProfile: { cycleId: id },
                OR: [{ startedAt: { gt: end } }, { endedAt: { gt: end } }],
              },
            })
          )
            throw new ConflictException('نهاية السايكل تسبق نهاية تكليف قائم.');
          if (
            await db.visit.count({
              where: {
                cycleId: id,
                OR: [
                  { completedAt: { lt: start } },
                  { completedAt: { gte: new Date(+end + 86400000) } },
                ],
              },
            })
          )
            throw new ConflictException('المدة تستبعد زيارات محفوظة.');
          const classes = await db.targetClass.count({
            where: {
              id: { in: dto.frequency.map((r) => r.id) },
              organizationId: user.organizationId!,
              isActive: true,
            },
          });
          if (classes !== dto.frequency.length)
            throw new BadRequestException('تصنيف غير متاح للشركة.');
          const oldDays = cycle.workingDays.length
            ? cycle.workingDays
            : await db.organizationWorkingDayRule.findMany({
                where: { organizationId: user.organizationId! },
              });
          const today = new Date(
            dateInZone(new Date(), cycle.timezone) + 'T00:00:00Z',
          );
          const daysChanged = dto.workingDays.some(
            (d) =>
              oldDays.find((o) => o.weekday === d.weekday)?.isWorking !==
              d.isWorking,
          );
          if (daysChanged && cycle.status === 'ACTIVE' && oldDays.length !== 7)
            throw new ConflictException(
              'أكمل قواعد أيام العمل السبعة قبل تعديل سايكل جارٍ.',
            );
          if (daysChanged && cycle.status === 'ACTIVE') {
            const data = [];
            for (
              let date = new Date(cycle.startsAt);
              date <= today && date <= cycle.endsAt;
              date = new Date(+date + 86400000)
            ) {
              const rule = oldDays.find((d) => d.weekday === date.getUTCDay())!;
              data.push({
                cycleId: id,
                date,
                isWorking: rule.isWorking,
                workloadFactor: rule.workloadFactor,
                note: 'حفظ قاعدة اليوم قبل تعديل أيام العمل',
              });
            }
            await db.cycleDayOverride.createMany({
              data,
              skipDuplicates: true,
            });
          }
          if (dto.roundEditWindowHours !== undefined)
            await db.organizationSettings.update({
              where: { organizationId: user.organizationId! },
              data: { roundEditWindowHours: dto.roundEditWindowHours },
            });
          await db.cycle.update({
            where: { id },
            data: { startsAt: start, endsAt: end },
          });
          for (const r of dto.frequency)
            await db.cycleClassRule.upsert({
              where: {
                cycleId_targetClassId: { cycleId: id, targetClassId: r.id },
              },
              create: {
                cycleId: id,
                targetClassId: r.id,
                requiredVisits: r.requiredVisits,
              },
              update: { requiredVisits: r.requiredVisits },
            });
          for (const d of dto.workingDays) {
            const old = oldDays.find((o) => o.weekday === d.weekday);
            const workloadFactor = d.isWorking
              ? old?.isWorking && old.workloadFactor > 0
                ? old.workloadFactor
                : 1
              : 0;
            await db.cycleWorkingDayRule.upsert({
              where: { cycleId_weekday: { cycleId: id, weekday: d.weekday } },
              create: {
                cycleId: id,
                weekday: d.weekday,
                isWorking: d.isWorking,
                workloadFactor,
              },
              update: { isWorking: d.isWorking, workloadFactor },
            });
          }
          await db.auditLog.create({
            data: {
              organizationId: user.organizationId!,
              actorId: user.id,
              action: 'UPDATE',
              entityType: 'Cycle',
              entityId: id,
              beforeData: {
                startsOn: cycle.startsAt.toISOString(),
                endsOn: cycle.endsAt.toISOString(),
                frequency: cycle.classRules,
                workingDays: oldDays,
              },
              afterData: JSON.parse(JSON.stringify(dto)),
            },
          });
          return { id };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2034'
      )
        throw new ConflictException('تعديل متزامن، أعد المحاولة.');
      throw e;
    }
  }
}
