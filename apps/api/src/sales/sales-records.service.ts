import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { SalesAccessService } from './sales-access.service.js';
import { priceItems, salesDate } from './sales-policy.js';
import type {
  SalesOrderDto,
  SalesReviewDto,
  SalesVisitDto,
} from './sales.dto.js';

const identity = { select: { id: true, name: true } };
const visitInclude = {
  author: identity,
  province: identity,
  target: identity,
} satisfies Prisma.SalesVisitInclude;
const orderInclude = {
  ...visitInclude,
  agent: identity,
  reviewer: identity,
  items: true,
} satisfies Prisma.SalesOrderInclude;

@Injectable()
export class SalesRecordsService {
  constructor(
    private readonly db: PrismaService,
    private readonly access: SalesAccessService,
  ) {}
  private async target(
    db: Prisma.TransactionClient,
    organizationId: string,
    dto: SalesVisitDto,
  ) {
    const target = await db.fieldTarget.findFirst({
      where: {
        id: dto.targetId,
        organizationId,
        isActive: true,
        deletedAt: null,
        type: { in: ['PHARMACY', 'HOSPITAL'] },
        locations: {
          some: {
            area: {
              organizationId,
              provinceId: dto.provinceId,
              deletedAt: null,
              province: { organizationId, deletedAt: null },
            },
          },
        },
      },
    });
    if (!target)
      throw new BadRequestException(
        'الجهة ليست ضمن المحافظة المختارة أو ليست متاحة.',
      );
  }
  async visits(user: AuthUser, page = 1) {
    const { organizationId, manager } = await this.access.scope(user);
    const where = {
      organizationId,
      ...(!manager ? { authorId: user.id } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.salesVisit.findMany({
        where,
        include: visitInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 30,
        take: 30,
      }),
      this.db.salesVisit.count({ where }),
    ]);
    return { items, total, page };
  }
  async orders(user: AuthUser, page = 1) {
    const { organizationId, manager } = await this.access.scope(user);
    const where = {
      organizationId,
      ...(!manager ? { authorId: user.id } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.salesOrder.findMany({
        where,
        include: orderInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * 30,
        take: 30,
      }),
      this.db.salesOrder.count({ where }),
    ]);
    return { items, total, page };
  }
  async visit(user: AuthUser, dto: SalesVisitDto) {
    const { organizationId } = await this.access.scope(user, 'submit');
    const visitedOn = salesDate(dto.date);
    const key = {
      authorId_clientRef: { authorId: user.id, clientRef: dto.clientRef },
    };
    const existing = await this.db.salesVisit.findUnique({ where: key });
    if (existing) return existing;
    try {
      return await this.db.$transaction(async (db) => {
        await this.target(db, organizationId, dto);
        const row = await db.salesVisit.create({
          data: {
            organizationId,
            authorId: user.id,
            provinceId: dto.provinceId,
            targetId: dto.targetId,
            clientRef: dto.clientRef,
            visitedOn,
            notes: dto.notes.trim(),
          },
        });
        await db.auditLog.create({
          data: {
            organizationId,
            actorId: user.id,
            action: 'CREATE',
            entityType: 'SalesVisit',
            entityId: row.id,
          },
        });
        return row;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.db.salesVisit.findUnique({ where: key });
        if (replay) return replay;
      }
      throw error;
    }
  }
  async order(user: AuthUser, dto: SalesOrderDto) {
    const { organizationId } = await this.access.scope(user, 'submit');
    const orderedOn = salesDate(dto.date);
    const priced = priceItems(dto.items);
    const key = {
      authorId_clientRef: { authorId: user.id, clientRef: dto.clientRef },
    };
    const existing = await this.db.salesOrder.findUnique({ where: key });
    if (existing) return existing;
    try {
      return await this.db.$transaction(async (db) => {
        await this.target(db, organizationId, dto);
        const agent = await db.salesAgent.findFirst({
          where: {
            id: dto.agentId,
            organizationId,
            provinceId: dto.provinceId,
            isActive: true,
          },
        });
        if (!agent)
          throw new BadRequestException(
            'الوكيل غير متاح في المحافظة المختارة.',
          );
        if (
          dto.visitId &&
          !(await db.salesVisit.findFirst({
            where: {
              id: dto.visitId,
              organizationId,
              authorId: user.id,
              provinceId: dto.provinceId,
              targetId: dto.targetId,
            },
          }))
        )
          throw new BadRequestException('الزيارة المرتبطة غير صالحة.');
        const products = await db.product.findMany({
          where: {
            id: { in: priced.map((item) => item.productId) },
            organizationId,
            isActive: true,
            deletedAt: null,
          },
          select: { id: true, name: true },
        });
        if (products.length !== priced.length)
          throw new BadRequestException('بعض الأصناف غير متاحة ضمن الشركة.');
        const row = await db.salesOrder.create({
          data: {
            organizationId,
            authorId: user.id,
            provinceId: dto.provinceId,
            targetId: dto.targetId,
            agentId: dto.agentId,
            visitId: dto.visitId,
            clientRef: dto.clientRef,
            orderedOn,
            notes: dto.notes.trim(),
            currency: 'SYP',
            total: priced.reduce(
              (total, item) => total.add(item.total),
              new Prisma.Decimal(0),
            ),
            items: {
              create: priced.map((item) => ({
                ...item,
                productName: products.find(
                  (product) => product.id === item.productId,
                )!.name,
              })),
            },
          },
        });
        await db.auditLog.create({
          data: {
            organizationId,
            actorId: user.id,
            action: 'CREATE',
            entityType: 'SalesOrder',
            entityId: row.id,
          },
        });
        return row;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.db.salesOrder.findUnique({ where: key });
        if (replay) return replay;
      }
      throw error;
    }
  }
  async review(user: AuthUser, id: string, dto: SalesReviewDto) {
    const { organizationId } = await this.access.scope(user, 'review');
    if (dto.status === 'REJECTED' && !dto.note.trim())
      throw new BadRequestException('يرجى كتابة سبب الرفض.');
    return this.db.$transaction(async (db) => {
      const current = await db.salesOrder.findFirst({
        where: { id, organizationId },
      });
      if (!current) throw new NotFoundException();
      const result = await db.salesOrder.updateMany({
        where: { id, organizationId, status: 'PENDING' },
        data: {
          status: dto.status,
          reviewerId: user.id,
          reviewedAt: new Date(),
          reviewNote: dto.note.trim(),
        },
      });
      if (!result.count)
        throw new ConflictException('تمت مراجعة الطلب مسبقاً. حدّث القائمة.');
      await db.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: 'UPDATE',
          entityType: 'SalesOrder',
          entityId: id,
          afterData: { status: dto.status, note: dto.note.trim() },
        },
      });
      return db.salesOrder.findUniqueOrThrow({
        where: { id },
        include: orderInclude,
      });
    });
  }
}
