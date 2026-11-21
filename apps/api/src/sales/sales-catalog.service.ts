import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { SalesAccessService } from './sales-access.service.js';
import type { SalesAccountDto, SalesAgentDto } from './sales.dto.js';

@Injectable()
export class SalesCatalogService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: SalesAccessService,
  ) {}
  async options(user: AuthUser, provinceId?: string) {
    const { organizationId, manager } = await this.access.scope(user);
    const [provinces, products, agents, targets, accounts] = await Promise.all([
      this.db.province.findMany({
        where: { organizationId, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.db.product.findMany({
        where: { organizationId, isActive: true, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.db.salesAgent.findMany({
        where: {
          organizationId,
          isActive: true,
          ...(provinceId ? { provinceId } : {}),
        },
        include: { province: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      provinceId
        ? this.db.fieldTarget.findMany({
            where: {
              organizationId,
              isActive: true,
              deletedAt: null,
              type: { in: ['PHARMACY', 'HOSPITAL'] },
              locations: {
                some: { area: { provinceId, organizationId, deletedAt: null } },
              },
            },
            select: { id: true, name: true, type: true },
            orderBy: { name: 'asc' },
          })
        : [],
      manager
        ? this.db.user.findMany({
            where: {
              organizationId,
              deletedAt: null,
              roles: { some: { role: { code: 'SALES_MANAGER' } } },
            },
            select: { id: true, name: true, username: true, status: true },
          })
        : [],
    ]);
    return { provinces, products, agents, targets, accounts };
  }
  async agent(user: AuthUser, dto: SalesAgentDto) {
    const { organizationId } = await this.access.scope(user, 'review');
    const name = dto.name.trim();
    if (
      !name ||
      !(await this.db.province.findFirst({
        where: { id: dto.provinceId, organizationId, deletedAt: null },
      }))
    )
      throw new BadRequestException('الاسم أو المحافظة غير صالح.');
    try {
      return await this.db.$transaction(async (db) => {
        const row = await db.salesAgent.create({
          data: { organizationId, provinceId: dto.provinceId, name },
        });
        await db.auditLog.create({
          data: {
            organizationId,
            actorId: user.id,
            action: 'CREATE',
            entityType: 'SalesAgent',
            entityId: row.id,
          },
        });
        return row;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('الوكيل موجود في المحافظة.');
      throw error;
    }
  }
  async account(user: AuthUser, dto: SalesAccountDto) {
    const { organizationId } = await this.access.scope(user, 'review');
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('الاسم مطلوب.');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.db.$transaction(async (db) => {
        const role = await db.role.findUniqueOrThrow({
          where: { code: 'SALES_MANAGER' },
        });
        const row = await db.user.create({
          data: {
            organizationId,
            name,
            username: dto.username,
            passwordHash,
            roles: { create: { roleId: role.id } },
          },
          select: { id: true, name: true, username: true },
        });
        await db.auditLog.create({
          data: {
            organizationId,
            actorId: user.id,
            action: 'CREATE',
            entityType: 'SalesManager',
            entityId: row.id,
          },
        });
        return row;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('اسم الدخول مستخدم.');
      throw error;
    }
  }
}
