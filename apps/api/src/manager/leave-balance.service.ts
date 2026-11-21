import { ForbiddenException, Injectable } from '@nestjs/common';
import { IsNumber, Min, Max, IsDivisibleBy } from 'class-validator';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { RepActivityService } from '../rep/rep-activity.service.js';
import { dateInZone } from '../rep/rep-workspace.service.js';
import type { AuthUser } from '../auth/auth.types.js';
export class LeaveBalanceDto {
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(366) allocatedDays: number;
}
@Injectable()
export class LeaveBalanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: RepActivityService,
  ) {}
  private async subject(
    db: Prisma.TransactionClient,
    user: AuthUser,
    repId: string,
  ) {
    if (
      !user.organizationId ||
      !user.permissions.includes('leaves.manage_balances')
    )
      throw new ForbiddenException();
    const rep = await db.user.findFirst({
      where: {
        id: repId,
        organizationId: user.organizationId,
        deletedAt: null,
        repProfile: { isNot: null },
      },
    });
    if (!rep) throw new ForbiddenException('المندوب خارج الشركة.');
    const subject = {
      ...user,
      id: rep.id,
      name: rep.name,
      username: rep.username,
    };
    if (!user.permissions.includes('leaves.configure')) {
      const approver = await this.activity.approver(subject, db);
      if (approver?.id !== user.id)
        throw new ForbiddenException(
          'تعديل الرصيد لصاحب الشركة أو مدير الإجازات المكلف.',
        );
    }
    return subject;
  }
  async get(user: AuthUser, repId: string) {
    const subject = await this.subject(this.prisma, user, repId);
    const info = await this.activity.leaves(subject);
    const settings = await this.prisma.organizationSettings.findUniqueOrThrow({
      where: { organizationId: user.organizationId! },
    });
    const balance = await this.prisma.leaveBalance.findUnique({
      where: { userId_year: { userId: repId, year: info.year } },
    });
    return {
      year: info.year,
      allocatedDays: balance?.allocatedDays ?? settings.defaultAnnualLeaveDays,
      carriedDays: balance?.carriedDays ?? 0,
      adjustmentDays: balance?.adjustmentDays ?? 0,
      remainingDays: info.balance,
    };
  }
  async save(user: AuthUser, dto: LeaveBalanceDto, repId?: string) {
    return this.prisma.$transaction(
      async (db) => {
        if (!user.organizationId) throw new ForbiddenException();
        const settings = await db.organizationSettings.findUniqueOrThrow({
          where: { organizationId: user.organizationId },
        });
        const year = Number(
          dateInZone(new Date(), settings.timezone).slice(0, 4),
        );
        if (repId) {
          await this.subject(db, user, repId);
          const old = await db.leaveBalance.findUnique({
            where: { userId_year: { userId: repId, year } },
          });
          await db.leaveBalance.upsert({
            where: { userId_year: { userId: repId, year } },
            create: {
              organizationId: user.organizationId,
              userId: repId,
              year,
              allocatedDays: dto.allocatedDays,
            },
            update: { allocatedDays: dto.allocatedDays },
          });
          await db.auditLog.create({
            data: {
              organizationId: user.organizationId,
              actorId: user.id,
              action: 'UPDATE',
              entityType: 'LeaveBalance',
              entityId: repId,
              beforeData: {
                allocatedDays:
                  old?.allocatedDays ?? settings.defaultAnnualLeaveDays,
              },
              afterData: { year, allocatedDays: dto.allocatedDays },
            },
          });
        } else {
          if (!user.permissions.includes('leaves.configure'))
            throw new ForbiddenException(
              'رصيد الشركة يتطلب صلاحية إدارة الإجازات.',
            );
          await db.organizationSettings.update({
            where: { organizationId: user.organizationId },
            data: { defaultAnnualLeaveDays: dto.allocatedDays },
          });
          await db.auditLog.create({
            data: {
              organizationId: user.organizationId,
              actorId: user.id,
              action: 'UPDATE',
              entityType: 'OrganizationSettings',
              entityId: settings.id,
              beforeData: {
                defaultAnnualLeaveDays: settings.defaultAnnualLeaveDays,
              },
              afterData: { defaultAnnualLeaveDays: dto.allocatedDays },
            },
          });
        }
        return { year, allocatedDays: dto.allocatedDays };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
