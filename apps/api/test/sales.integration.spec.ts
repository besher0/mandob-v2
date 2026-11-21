import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service.js';
import { SalesAccessService } from '../src/sales/sales-access.service.js';
import { SalesCatalogService } from '../src/sales/sales-catalog.service.js';
import { SalesRecordsService } from '../src/sales/sales-records.service.js';
import type { AuthUser } from '../src/auth/auth.types.js';

describe.skipIf(process.env.RUN_DB_TESTS !== '1')(
  'sales database workflow',
  () => {
    it('records standalone visits, submits requests, isolates tenants and approves once; rolls back fixtures', async () => {
      const db = new PrismaService(new ConfigService(process.env));
      await db.$connect();
      const rollback = new Error('ROLLBACK_SALES_TEST');
      try {
        await expect(
          db.$transaction(
            async (tx) => {
              const nested = new Proxy(tx, {
                get(target, key) {
                  if (key === '$transaction')
                    return (fn: (client: typeof tx) => unknown) => fn(tx);
                  return Reflect.get(target, key);
                },
              }) as PrismaService;
              const company = await tx.organization.create({
                data: { name: 'Sales test', code: randomUUID() },
              });
              const foreign = await tx.organization.create({
                data: { name: 'Other sales test', code: randomUUID() },
              });
              async function user(
                organizationId: string,
                code: string,
              ): Promise<AuthUser> {
                const role = await tx.role.findUniqueOrThrow({
                  where: { code },
                });
                const row = await tx.user.create({
                  data: {
                    organizationId,
                    name: code,
                    username: randomUUID(),
                    passwordHash: 'not-a-login',
                    roles: { create: { roleId: role.id } },
                  },
                });
                return { ...row, roles: [code], permissions: [] };
              }
              const owner = await user(company.id, 'NATIONAL_MANAGER');
              const seller = await user(company.id, 'SALES_MANAGER');
              const otherSeller = await user(company.id, 'SALES_MANAGER');
              const outsider = await user(foreign.id, 'NATIONAL_MANAGER');
              const province = await tx.province.create({
                data: { organizationId: company.id, name: 'Test province' },
              });
              const area = await tx.area.create({
                data: {
                  organizationId: company.id,
                  provinceId: province.id,
                  name: 'Test area',
                },
              });
              const target = await tx.fieldTarget.create({
                data: {
                  organizationId: company.id,
                  name: 'Test pharmacy',
                  type: 'PHARMACY',
                  locations: { create: { areaId: area.id } },
                },
              });
              const product = await tx.product.create({
                data: { organizationId: company.id, name: 'Test product' },
              });
              const access = new SalesAccessService(nested),
                catalog = new SalesCatalogService(nested, access),
                records = new SalesRecordsService(nested, access);
              const agent = await catalog.agent(owner, {
                name: 'Test agent',
                provinceId: province.id,
              });
              const visitDto = {
                provinceId: province.id,
                targetId: target.id,
                date: '2026-01-01',
                clientRef: randomUUID(),
                notes: 'visit without sale',
              };
              const visit = await records.visit(seller, visitDto);
              expect((await records.orders(owner)).total).toBe(0);
              expect((await records.visit(seller, visitDto)).id).toBe(visit.id);
              const orderDto = {
                ...visitDto,
                clientRef: randomUUID(),
                visitId: visit.id,
                agentId: agent.id,
                currency: 'SYP',
                items: [
                  {
                    productId: product.id,
                    quantity: 3,
                    unitPrice: '10.25',
                    offerType: 'DISCOUNT' as const,
                    bonusQuantity: 0,
                    discountPercent: '10',
                  },
                ],
              };
              const order = await records.order(seller, orderDto);
              expect(order.total.toString()).toBe('27.68');
              expect((await records.order(seller, orderDto)).id).toBe(order.id);
              expect((await records.orders(otherSeller)).total).toBe(0);
              expect((await records.orders(outsider)).total).toBe(0);
              await expect(
                records.review(outsider, order.id, {
                  status: 'APPROVED',
                  note: '',
                }),
              ).rejects.toThrow();
              await expect(
                records.review(seller, order.id, {
                  status: 'APPROVED',
                  note: '',
                }),
              ).rejects.toThrow();
              await records.review(owner, order.id, {
                status: 'APPROVED',
                note: 'approved',
              });
              await expect(
                records.review(owner, order.id, {
                  status: 'REJECTED',
                  note: 'second decision',
                }),
              ).rejects.toThrow();
              expect((await records.orders(seller)).items[0].status).toBe(
                'APPROVED',
              );
              throw rollback;
            },
            { timeout: 30000 },
          ),
        ).rejects.toBe(rollback);
      } finally {
        await db.$disconnect();
      }
    });
  },
);
