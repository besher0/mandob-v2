import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service.js';
import { RepWorkspaceService } from '../src/rep/rep-workspace.service.js';
import { RegisterRoundDto } from '../src/rep/dto/round.dto.js';

// Explicit opt-in: use existing assignments, and roll back every write.
describe.skipIf(process.env.RUN_DB_TESTS !== '1')(
  'real PostgreSQL round registration (rollback)',
  () => {
    it('loads assigned data, saves visits/products atomically, rejects invalid assignments and replays safely', async () => {
      const prisma = new PrismaService(new ConfigService(process.env));
      const rollback = new Error('ROLLBACK_TEST');
      await prisma.$connect();
      try {
        const profile = await prisma.repCycleProfile.findFirst({
          where: {
            isActive: true,
            cycle: { status: 'ACTIVE', startsAt: { lte: new Date() }, endsAt: { gte: new Date(new Date().toISOString().slice(0, 10)) } },
            targets: { some: {} },
            areas: { some: {} },
          },
          include: { rep: true },
        });
        expect(
          profile,
          'an existing representative assignment is required',
        ).not.toBeNull();
        const user = {
          id: profile!.repId,
          organizationId: profile!.organizationId,
          name: profile!.rep.name,
          username: profile!.rep.username,
          roles: [],
          permissions: [],
        };
        const before = await prisma.fieldRound.count();
        await expect(
          prisma.$transaction(
            async (tx) => {
              const transactional = new Proxy(tx, {
                get(obj, property) {
                  if (property === '$transaction')
                    return (fn: (db: typeof tx) => unknown) => fn(tx);
                  return Reflect.get(obj, property);
                },
              }) as PrismaService;
              // Scope this non-location test independently of live company settings.
              // The outer rollback restores the original policy.
              await tx.organizationSettings.update({
                where: { organizationId: profile!.organizationId },
                data: { roundLocationPolicy: 'DISABLED' },
              });
              const writer = new RepWorkspaceService(transactional);
        // Restore one assigned fixture only inside the rollback transaction.
        // The user's catalog may legitimately have been soft-deleted.
        const fixture=await tx.repCycleTarget.findFirstOrThrow({where:{repCycleProfileId:profile!.id,target:{type:'DOCTOR'}}});
        await tx.fieldTarget.update({where:{id:fixture.targetId},data:{deletedAt:null,isActive:true}});
        const service = writer;
        const workspace = await service.workspace(user);
        const result = await service.targets(user, { type: 'DOCTOR' });
        const target = result.items.find((t) =>
          t.locations.some((l) =>
            workspace.areas.some((a) => a.id === l.areaId),
          ),
        )!;
        expect(target).toBeDefined();
        const areaId = target.locations.find((l) =>
          workspace.areas.some((a) => a.id === l.areaId),
        )!.areaId;
        const products = workspace.products.slice(0, 1).map((p) => p.id);
        const dto = {
          clientRef: randomUUID(),
          cycleId: workspace.cycle!.id,
          type: 'DOCTOR',
          areaIds: [areaId],
          targetIds: [target.id],
          productIds: products,
          visitDate: workspace.cycle!.today,
          notes: 'transaction rollback verification',
        } satisfies RegisterRoundDto;

              const previousPeriods = await tx.repCycleTeamPeriod.findMany({
                where: { repCycleProfileId: profile!.id },
              });
              await tx.repCycleTeamPeriod.updateMany({
                where: { repCycleProfileId: profile!.id },
                data: { scopeConfigured: false },
              });
              await expect(writer.register(user, dto)).rejects.toThrow(
                'تكليف الفريق غير مكتمل',
              );
              expect(await tx.fieldRound.count()).toBe(before);
              for (const period of previousPeriods)
                await tx.repCycleTeamPeriod.update({
                  where: { id: period.id },
                  data: { scopeConfigured: period.scopeConfigured },
                });
              const testTeam = await tx.team.create({
                data: {
                  organizationId: user.organizationId!,
                  name: 'rollback scope team',
                },
              });
              const testPeriod = await tx.repCycleTeamPeriod.create({
                data: {
                  teamId: testTeam.id,
                  repCycleProfileId: profile!.id,
                  startedAt: new Date(dto.visitDate + 'T00:00:00Z'),
                  scopeConfigured: true,
                  scopeAreas: { create: { areaId } },
                  scopeProducts: {
                    create: products.map((productId) => ({ productId })),
                  },
                },
              });
              const doctorAssignment = await tx.repCycleTarget.findFirstOrThrow(
                {
                  where: {
                    repCycleProfileId: profile!.id,
                    targetId: target.id,
                  },
                },
              );
              await tx.teamScopeTarget.create({
                data: {
                  teamPeriodId: testPeriod.id,
                  repCycleTargetId: doctorAssignment.id,
                  requiredVisits: doctorAssignment.requiredVisits,
                },
              });
              const pharmacy = await tx.fieldTarget.create({
                data: {
                  organizationId: user.organizationId!,
                  type: 'PHARMACY',
                  name: 'rollback pharmacy',
                  pharmacyProfile: { create: { affiliation: 'UNION' } },
                  locations: { create: { areaId, isPrimary: true } },
                  repAssignments: {
                    create: {
                      repCycleProfileId: profile!.id,
                      targetClassId: target.class.id,
                      requiredVisits: 2,
                    },
                  },
                },
              });
              const hospital = await tx.fieldTarget.create({
                data: {
                  organizationId: user.organizationId!,
                  type: 'HOSPITAL',
                  name: 'rollback hospital',
                  hospitalProfile: { create: { kind: 'PRIVATE' } },
                  locations: { create: { areaId, isPrimary: true } },
                  repAssignments: {
                    create: {
                      repCycleProfileId: profile!.id,
                      targetClassId: target.class.id,
                      requiredVisits: 1,
                    },
                  },
                },
              });
              const extraAssignments = await tx.repCycleTarget.findMany({
                where: {
                  repCycleProfileId: profile!.id,
                  targetId: { in: [pharmacy.id, hospital.id] },
                },
              });
              await tx.teamScopeTarget.createMany({
                data: extraAssignments.map((a) => ({
                  teamPeriodId: testPeriod.id,
                  repCycleTargetId: a.id,
                  requiredVisits: a.requiredVisits,
                })),
              });
              expect(
                (
                  await writer.targets(user, {
                    type: 'PHARMACY',
                    affiliations: 'UNION',
                  })
                ).items.some((t) => t.id === pharmacy.id),
              ).toBe(true);
              expect(
                (
                  await writer.targets(user, {
                    type: 'PHARMACY',
                    affiliations: 'INDEPENDENT',
                  })
                ).items.some((t) => t.id === pharmacy.id),
              ).toBe(false);
              expect(
                (
                  await writer.targets(user, {
                    type: 'HOSPITAL',
                    kinds: 'PRIVATE',
                  })
                ).items.some((t) => t.id === hospital.id),
              ).toBe(true);
              expect(
                (await writer.workspace(user)).areas.find(
                  (a) => a.id === areaId,
                )?.byType.HOSPITAL.privateCount,
              ).toBeGreaterThan(0);
              await expect(
                writer.register(user, { ...dto, targetIds: [randomUUID()] }),
              ).rejects.toThrow();
              await expect(
                writer.register(user, { ...dto, areaIds: [randomUUID()] }),
              ).rejects.toThrow();
              await expect(
                writer.register(user, { ...dto, productIds: [randomUUID()] }),
              ).rejects.toThrow();
              await expect(
                writer.register(user, { ...dto, visitDate: '2099-01-01' }),
              ).rejects.toThrow();
              const saved = await writer.register(user, dto);
              const replay = await writer.register(user, dto);
              expect(replay.id).toBe(saved.id);
              expect(await tx.fieldRound.count()).toBe(before + 1);
              const visits = await tx.visit.findMany({
                where: { roundId: saved.id },
                include: { products: true },
              });
              expect(visits).toHaveLength(1);
              expect(visits[0].status).toBe('COMPLETED');
              expect(visits[0].products.map((p) => p.productId)).toEqual(
                products,
              );
              const history = await writer.history(user, 'DOCTOR');
              expect(
                history.items.some(
                  (item) =>
                    item.id === `${saved.id}:DOCTOR` &&
                    item.targets.some((t) => t.id === target.id) &&
                    item.areas.some((a) => a.id === areaId),
                ),
              ).toBe(true);
              expect(
                (await writer.history({ ...user, id: randomUUID() })).items,
              ).toEqual([]);
              await expect(
                writer.register(user, { ...dto, notes: 'changed' }),
              ).rejects.toThrow();
              await expect(
                writer.register({ ...user, id: randomUUID() }, dto),
              ).rejects.toThrow();
              throw rollback;
            },
            { timeout: 20000 },
          ),
        ).rejects.toBe(rollback);
        expect(await prisma.fieldRound.count()).toBe(before);
      } finally {
        await prisma.$disconnect();
      }
    }, 30000);
  },
);
