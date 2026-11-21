import { describe, expect, it, vi } from 'vitest';
import { priceItems, salesDate } from '../src/sales/sales-policy.js';
import { SalesAccessService } from '../src/sales/sales-access.service.js';
import { SalesRecordsService } from '../src/sales/sales-records.service.js';
import type { SalesItemDto } from '../src/sales/sales.dto.js';
import type { PrismaService } from '../src/database/prisma.service.js';
import type { AuthUser } from '../src/auth/auth.types.js';

const item = {
  productId: 'product',
  quantity: 3,
  unitPrice: '10.25',
  offerType: 'NONE',
  bonusQuantity: 0,
  discountPercent: '0',
} satisfies SalesItemDto;
const actor: AuthUser = {
  id: 'actor',
  organizationId: 'company',
  name: 'Actor',
  username: 'actor',
  roles: [],
  permissions: [],
};
describe('sales pricing and scope', () => {
  it('uses decimal math, applies percentage only to paid units, and keeps bonus free', () => {
    expect(priceItems([item])[0].total.toString()).toBe('30.75');
    expect(
      priceItems([
        { ...item, offerType: 'DISCOUNT', discountPercent: '10' },
      ])[0].total.toString(),
    ).toBe('27.68');
    expect(
      priceItems([
        { ...item, offerType: 'BONUS', bonusQuantity: 2 },
      ])[0].total.toString(),
    ).toBe('30.75');
    expect(() => priceItems([item, item])).toThrow();
    expect(() => priceItems([{ ...item, bonusQuantity: 2 }])).toThrow();
    expect(() =>
      priceItems([{ ...item, offerType: 'DISCOUNT', discountPercent: '101' }]),
    ).toThrow();
    expect(() => priceItems([{ ...item, unitPrice: '0' }])).toThrow();
  });
  it('rejects impossible or future dates', () => {
    expect(() => salesDate('2026-02-30')).toThrow();
    expect(() => salesDate('2999-01-01')).toThrow();
    expect(salesDate('2026-01-01').toISOString()).toBe(
      '2026-01-01T00:00:00.000Z',
    );
  });
  it('checks current database roles and organization rather than trusting claimed role names', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const access = new SalesAccessService({
      user: { findFirst },
    } as unknown as PrismaService);
    await expect(
      access.scope({ ...actor, roles: ['NATIONAL_MANAGER'] }, 'review'),
    ).rejects.toThrow();
    expect(findFirst.mock.calls[0][0].where).toMatchObject({
      organizationId: 'company',
      status: 'ACTIVE',
      deletedAt: null,
      roles: { some: { role: { code: { in: ['NATIONAL_MANAGER'] } } } },
    });
  });
  it('limits sales managers to their own records, including count', async () => {
    const findMany = vi.fn().mockResolvedValue([]),
      count = vi.fn().mockResolvedValue(0);
    const db = { salesOrder: { findMany, count } } as unknown as PrismaService;
    const access = {
      scope: vi
        .fn()
        .mockResolvedValue({ organizationId: 'company', manager: false }),
    } as unknown as SalesAccessService;
    await new SalesRecordsService(db, access).orders(actor);
    expect(findMany.mock.calls[0][0].where).toEqual({
      organizationId: 'company',
      authorId: 'actor',
    });
    expect(count.mock.calls[0][0].where).toEqual({
      organizationId: 'company',
      authorId: 'actor',
    });
  });
  it('prevents a second review and scopes the atomic status transition to the company', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const transaction = {
      salesOrder: {
        findFirst: vi.fn().mockResolvedValue({ id: 'order' }),
        updateMany,
      },
    };
    const db = {
      $transaction: (fn: (tx: unknown) => unknown) => fn(transaction),
    } as unknown as PrismaService;
    const access = {
      scope: vi
        .fn()
        .mockResolvedValue({ organizationId: 'company', manager: true }),
    } as unknown as SalesAccessService;
    await expect(
      new SalesRecordsService(db, access).review(actor, 'order', {
        status: 'APPROVED',
        note: '',
      }),
    ).rejects.toThrow('تمت مراجعة');
    expect(updateMany.mock.calls[0][0].where).toEqual({
      id: 'order',
      organizationId: 'company',
      status: 'PENDING',
    });
  });
  it('rejects a target outside the selected company/province before writing a visit', async () => {
    const create = vi.fn();
    const tx = {
      fieldTarget: { findFirst: vi.fn().mockResolvedValue(null) },
      salesVisit: { create },
    };
    const db = {
      salesVisit: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: (fn: (tx: unknown) => unknown) => fn(tx),
    } as unknown as PrismaService;
    const access = {
      scope: vi
        .fn()
        .mockResolvedValue({ organizationId: 'company', manager: false }),
    } as unknown as SalesAccessService;
    await expect(
      new SalesRecordsService(db, access).visit(actor, {
        provinceId: 'other',
        targetId: 'target',
        clientRef: 'ref',
        date: '2026-01-01',
        notes: '',
      }),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
    expect(tx.fieldTarget.findFirst.mock.calls[0][0].where.organizationId).toBe(
      'company',
    );
  });
});
