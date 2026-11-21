import { LeaveBalanceService } from '../src/manager/leave-balance.service.js';
import { CompanyService } from '../src/company/company.service.js';
import { CycleSettingsService } from '../src/manager/cycle-settings.service.js';
import { AreaManagementService } from '../src/manager/area-management.service.js';
import ExcelJS from 'exceljs';
import { TargetManagementService } from '../src/manager/target-management.service.js';
import bcrypt from 'bcryptjs';
import { RepManagementService } from '../src/manager/rep-management.service.js';
import 'dotenv/config';
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service.js';
import { TeamManagementService } from '../src/manager/team-management.service.js';
import { ManagerService } from '../src/manager/manager.service.js';
import { RepAnalyticsService } from '../src/rep/rep-analytics.service.js';
import { RepNotificationsService } from '../src/rep/rep-notifications.service.js';
import { RepActivityService } from '../src/rep/rep-activity.service.js';
import { TeamAssignmentService } from '../src/teams/team-assignment.service.js';
import { TeamReportService } from '../src/teams/team-report.service.js';
import {
  RepWorkspaceService,
  dateInZone,
} from '../src/rep/rep-workspace.service.js';
import type { AuthUser } from '../src/auth/auth.types.js';

// Isolated fixtures are created inside a single transaction and never committed.
describe.skipIf(process.env.RUN_DB_TESTS !== '1')(
  'multi-team attribution on PostgreSQL',
  () => {
    it('credits both managers, deduplicates company totals, scopes products, rejects cross-tenant access and preserves replay', async () => {
      const prisma = new PrismaService(new ConfigService(process.env));
      await prisma.$connect();
      const rollback = new Error('ROLLBACK_FIXTURES');
      const before = await prisma.organization.count();
      try {
        await expect(
          prisma.$transaction(
            async (tx) => {
              const db = new Proxy(tx, {
                get(obj, key) {
                  if (key === '$transaction')
                    return async (fn: (t: typeof tx) => unknown) => {
                      await tx.$executeRawUnsafe('SAVEPOINT service_test');
                      try {
                        const value = await fn(tx);
                        await tx.$executeRawUnsafe(
                          'RELEASE SAVEPOINT service_test',
                        );
                        return value;
                      } catch (error) {
                        await tx.$executeRawUnsafe(
                          'ROLLBACK TO SAVEPOINT service_test',
                        );
                        await tx.$executeRawUnsafe(
                          'RELEASE SAVEPOINT service_test',
                        );
                        throw error;
                      }
                    };
                  return Reflect.get(obj, key);
                },
              }) as PrismaService;
              const org = await tx.organization.create({
                data: { name: 'test org', code: randomUUID() },
              });
              await tx.organizationSettings.create({
                data: {
                  organizationId: org.id,
                  timezone: 'Asia/Damascus',
                  defaultAnnualLeaveDays: 18,
                },
              });
              const otherOrg = await tx.organization.create({
                data: { name: 'other org', code: randomUUID() },
              });
              const province = await tx.province.create({
                data: { organizationId: org.id, name: 'test province' },
              });
              const area = await tx.area.create({
                data: {
                  organizationId: org.id,
                  provinceId: province.id,
                  name: 'area 1',
                },
              });
              const area2 = await tx.area.create({
                data: {
                  organizationId: org.id,
                  provinceId: province.id,
                  name: 'area 2',
                },
              });
              const specialty = await tx.specialty.create({
                data: { organizationId: org.id, name: 'cardiology' },
              });
              const otherSpecialty = await tx.specialty.create({
                data: { organizationId: org.id, name: 'neurology' },
              });
              const productA = await tx.product.create({
                data: {
                  organizationId: org.id,
                  name: 'product A',
                  genericName: 'ingredient A',
                },
              });
              const productB = await tx.product.create({
                data: { organizationId: org.id, name: 'product B' },
              });
              const createUser = async (
                organizationId: string,
                permissions: string[],
              ): Promise<AuthUser> => {
                const u = await tx.user.create({
                  data: {
                    organizationId,
                    username: randomUUID(),
                    name: 'test user',
                    passwordHash: 'not-a-login',
                  },
                });
                return { ...u, roles: [], permissions };
              };
              const owner = await createUser(org.id, [
                'teams.manage',
                'cycles.configure',
                'analytics.view_national',
                'visits.view_all',
              ]);
              const rep = await createUser(org.id, []);
              const ahmad = await createUser(org.id, [
                'analytics.view_team',
                'visits.view_team',
              ]);
              const tarek = await createUser(org.id, [
                'analytics.view_team',
                'visits.view_team',
              ]);
              const outsider = await createUser(otherOrg.id, [
                'analytics.view_national',
                'visits.view_all',
                'teams.manage',
                'cycles.configure',
              ]);
              const now = new Date();
              const today = dateInZone(now, 'Asia/Damascus');
              const startsAt = new Date(`${today}T00:00:00Z`);
              startsAt.setUTCDate(startsAt.getUTCDate() - 5);
              const endsAt = new Date(`${today}T00:00:00Z`);
              endsAt.setUTCDate(endsAt.getUTCDate() + 20);
              const cycle = await tx.cycle.create({
                data: {
                  organizationId: org.id,
                  name: 'test cycle',
                  timezone: 'Asia/Damascus',
                  status: 'ACTIVE',
                  startsAt,
                  endsAt,
                },
              });
              const profile = await tx.repCycleProfile.create({
                data: {
                  organizationId: org.id,
                  cycleId: cycle.id,
                  repId: rep.id,
                  dailyVisitTarget: 8,
                  areas: {
                    create: [{ areaId: area.id }, { areaId: area2.id }],
                  },
                  products: {
                    create: [
                      { productId: productA.id },
                      { productId: productB.id },
                    ],
                  },
                },
              });
              const targetClass = await tx.targetClass.create({
                data: { organizationId: org.id, code: 'A', name: 'A', rank: 1 },
              });
              const createTarget = async (
                name: string,
                areaId: string,
                specialtyId: string,
              ) =>
                tx.fieldTarget.create({
                  data: {
                    organizationId: org.id,
                    type: 'DOCTOR',
                    name,
                    locations: { create: { areaId, isPrimary: true } },
                    specialties: { create: { specialtyId } },
                    repAssignments: {
                      create: {
                        repCycleProfileId: profile.id,
                        targetClassId: targetClass.id,
                        requiredVisits: 3,
                      },
                    },
                  },
                });
              const doctor = await createTarget(
                'same-name doctor',
                area.id,
                specialty.id,
              );
              const otherDoctor = await createTarget(
                'same-name doctor',
                area2.id,
                otherSpecialty.id,
              );
              const createTeam = async (
                name: string,
                managerId: string,
                productId: string,
              ) =>
                tx.team.create({
                  data: {
                    organizationId: org.id,
                    provinceId: province.id,
                    name,
                    specialties: { create: { specialtyId: specialty.id } },
                    products: { create: { productId } },
                    members: { create: { userId: managerId, isManager: true } },
                  },
                });
              const rx1 = await createTeam('RX1', ahmad.id, productA.id);
              const otc = await createTeam('OTC', tarek.id, productB.id);
              const rx2 = await createTeam('RX2', ahmad.id, productA.id);
              const legacyPeriod = await tx.repCycleTeamPeriod.create({
                data: {
                  repCycleProfileId: profile.id,
                  teamId: rx1.id,
                  startedAt: startsAt,
                },
              });
              const assignments = new TeamAssignmentService(db);
              const input = {
                repCycleProfileId: profile.id,
                teamId: rx1.id,
                areaIds: [area.id],
                startsOn: today,
                endsOn: endsAt.toISOString().slice(0, 10),
              };
              await expect(
                assignments.create(outsider, input),
              ).rejects.toThrow();
              await expect(assignments.create(ahmad, input)).rejects.toThrow();
              await assignments.create(owner, input);
              expect(
                await tx.repCycleTeamPeriod.findUnique({
                  where: { id: legacyPeriod.id },
                }),
              ).toMatchObject({
                startedAt: startsAt,
                endedAt: null,
                scopeConfigured: false,
              });
              await assignments.create(owner, { ...input, teamId: otc.id });
              await assignments.create(owner, { ...input, teamId: rx2.id });
              await expect(assignments.create(owner, input)).rejects.toThrow();
              const repService = new RepWorkspaceService(db);
              const workspace = await repService.workspace(rep);
              expect(workspace.areas.map((a) => a.id)).toEqual([area.id]);
              expect(
                (await repService.targets(rep, {})).items.map((t) => t.id),
              ).toEqual([doctor.id]);
              const payload = {
                clientRef: randomUUID(),
                cycleId: cycle.id,
                type: 'DOCTOR' as const,
                areaIds: [area.id],
                targetIds: [doctor.id],
                productIds: [productA.id, productB.id],
                visitDate: today,
                notes: 'shared visit',
              };
              await expect(
                repService.register(rep, {
                  ...payload,
                  targetIds: [otherDoctor.id],
                  areaIds: [area2.id],
                }),
              ).rejects.toThrow();
              await expect(
                repService.register(rep, {
                  ...payload,
                  visitDate: startsAt.toISOString().slice(0, 10),
                }),
              ).rejects.toThrow();
              const saved = await repService.register(rep, payload);
              expect((await repService.register(rep, payload)).id).toBe(
                saved.id,
              );
              expect(
                await tx.visit.count({ where: { organizationId: org.id } }),
              ).toBe(1);
              expect(
                await tx.visitTeamCredit.count({
                  where: { visit: { organizationId: org.id } },
                }),
              ).toBe(3);
              const manager = new ManagerService(db);
              const ownerRole = await tx.role.findUniqueOrThrow({where:{code:'NATIONAL_MANAGER'}});
              await tx.userRole.create({data:{userId:owner.id,roleId:ownerRole.id}});
              const companyOwner = {...owner,roles:['NATIONAL_MANAGER'],permissions:[...owner.permissions,'users.manage','users.view','users.manage_own']};
              const coverage = await new CompanyService(db).coverage(companyOwner);
              expect(coverage.physicalVisits).toBe(1);
              expect(coverage.unallocatedVisits).toBe(0);
              expect(coverage.provinces.find(p=>p.id===province.id)?.physicalVisits).toBe(1);
              const ownerOptions = await new RepManagementService(db).options(companyOwner,rep.id);
              expect(ownerOptions.teams.map(t=>t.id).sort()).toEqual([rx1.id,rx2.id,otc.id].sort());
              expect(ownerOptions.rep?.shared).toBe(false);
              const teamOwner = {...companyOwner,permissions:[...companyOwner.permissions,'teams.view','teams.configure_own']};
              const teamService = new TeamManagementService(db);
              const editable = await teamService.options(teamOwner,otc.id);
              await teamService.update(teamOwner,otc.id,{name:editable.team.name,specialtyIds:editable.team.specialtyIds,productIds:editable.team.productIds});
              await expect(teamService.options({...teamOwner,id:ahmad.id},otc.id)).rejects.toThrow();
              await expect(teamService.options({...teamOwner,organizationId:otherOrg.id},otc.id)).rejects.toThrow();
              await expect(new RepManagementService(db).options({...companyOwner,id:ahmad.id})).rejects.toThrow();
              await expect(new CompanyService(db).coverage({...companyOwner,organizationId:otherOrg.id})).rejects.toThrow();
              const ahmadWorkspace = await manager.workspace(ahmad);
              const tarekWorkspace = await manager.workspace(tarek);
              expect(ahmadWorkspace.teams.map((t) => t.id).sort()).toEqual(
                [rx1.id, rx2.id].sort(),
              );
              expect(ahmadWorkspace.summary.visits).toBe(1);
              for (const workspace of [ahmadWorkspace, tarekWorkspace]) {
                for (const team of workspace.teams) {
                  const rows = workspace.targets.filter(t => t.teamId === team.id && t.type === 'DOCTOR');
                  expect(team.doctorProgress.assignments).toBe(rows.length);
                  expect(team.doctorProgress.uniqueDoctors).toBe(new Set(rows.map(t => t.id)).size);
                  expect(team.doctorProgress.unvisited + team.doctorProgress.incomplete + team.doctorProgress.complete).toBe(rows.length);
                }
                for (const representative of workspace.reps) {
                  expect(representative.doctorProgress.assignments).toBe(workspace.targets.filter(t => t.repId === representative.id && t.type === 'DOCTOR').length);
                }
                for (const target of workspace.targets) {
                  expect(target.remainingVisits).toBe(Math.max(0, target.requiredVisits - target.completedVisits));
                  if (target.completedVisits) expect(target.lastVisit).toBeTruthy();
                  else expect(target.lastVisit).toBeNull();
                }
              }
              expect(ahmadWorkspace.targets.every(t => t.teamId !== otc.id)).toBe(true);

              expect(ahmadWorkspace.products).toEqual([
                expect.objectContaining({
                  id: productA.id,
                  genericName: 'ingredient A',
                }),
              ]);
              expect(tarekWorkspace.products.map((p) => p.id)).toEqual([
                productB.id,
              ]);
              const managedArea = ahmadWorkspace.areas.find(
                (a) => a.id === area.id,
              )!;
              expect(managedArea.counts.doctors).toBe(1);
              expect(managedArea.counts.reps).toBe(1);
              expect(managedArea.reps[0].visitedDoctors).toBe(1);
              expect(managedArea.reps[0].creditedVisits).toBe(2);

              expect(
                ahmadWorkspace.rounds[0].visits[0].products.map((p) => p.id),
              ).toEqual([productA.id]);
              expect(
                tarekWorkspace.rounds[0].visits[0].products.map((p) => p.id),
              ).toEqual([productB.id]);
              expect(ahmadWorkspace.reps.map((r) => r.id)).toEqual([rep.id]);
              expect(
                ahmadWorkspace.targets.some((t) => t.id === otherDoctor.id),
              ).toBe(false);
              expect((await manager.workspace(outsider)).targets).toEqual([]);
              const analytics = new RepAnalyticsService(db);
              const insights = await analytics.analytics(rep, {
                period: 'cycle',
              });
              expect(insights.current?.doctors.map((d) => d.id)).toEqual([
                doctor.id,
              ]);
              expect(insights.current?.products.map((p) => p.count)).toEqual([
                1, 1,
              ]);
              expect(insights.current?.summary.aVisits).toBe(1);
              expect(insights.previous).toBeNull();
              expect(insights.comparison).toEqual([]);
              const previousEnd = new Date(startsAt.getTime() - 86400000);
              const previousCycle = await tx.cycle.create({
                data: {
                  organizationId: org.id,
                  name: 'previous rollback cycle',
                  timezone: 'Asia/Damascus',
                  status: 'CLOSED',
                  startsAt: new Date(previousEnd.getTime() - 29 * 86400000),
                  endsAt: previousEnd,
                },
              });
              const doctorAssignment =
                await tx.repCycleTarget.findUniqueOrThrow({
                  where: {
                    repCycleProfileId_targetId: {
                      repCycleProfileId: profile.id,
                      targetId: doctor.id,
                    },
                  },
                });
              await tx.repCycleProfile.create({
                data: {
                  organizationId: org.id,
                  repId: rep.id,
                  cycleId: previousCycle.id,
                  dailyVisitTarget: 8,
                  areas: { create: { areaId: area.id } },
                  targets: {
                    create: {
                      targetId: doctor.id,
                      targetClassId: doctorAssignment.targetClassId,
                      requiredVisits: 2,
                    },
                  },
                },
              });
              const compared = await analytics.analytics(rep, {
                period: 'cycle',
              });
              expect(compared.previous?.cycle.id).toBe(previousCycle.id);
              expect(
                compared.comparison.find((row) => row.key === 'unvisited'),
              ).toMatchObject({
                current: 0,
                previous: 1,
                delta: -1,
                improved: true,
              });
              expect(
                (
                  await analytics.analytics(rep, {
                    period: 'cycle',
                    areaId: area2.id,
                  })
                ).current?.summary.total,
              ).toBe(0);
              expect(
                (await analytics.analytics(outsider, { period: 'cycle' }))
                  .current,
              ).toBeNull();
              const notifications = new RepNotificationsService(db);
              await tx.notification.create({
                data: {
                  organizationId: org.id,
                  userId: rep.id,
                  title: 'rep-only',
                  message: 'private message',
                },
              });
              await tx.notification.create({
                data: {
                  organizationId: otherOrg.id,
                  userId: outsider.id,
                  title: 'other-company',
                  message: 'private other message',
                },
              });
              expect(
                (await notifications.list(rep)).items.map((n) => n.title),
              ).toEqual(['rep-only']);
              expect(
                (await notifications.list(outsider)).items.map((n) => n.title),
              ).toEqual(['other-company']);
              expect(
                (
                  await notifications.list({
                    ...rep,
                    organizationId: otherOrg.id,
                  })
                ).items,
              ).toEqual([]);
              const activity = new RepActivityService(db);
              const reportInput = {
                clientRef: randomUUID(),
                period: 'DAILY' as const,
                from: today,
                to: today,
              };
              const preview = await activity.reportPreview(rep, reportInput);
              expect(preview).toMatchObject({
                total: 1,
                doctors: 1,
                pharmacies: 0,
                hospitals: 0,
              });
              const report = await activity.saveReport(rep, reportInput);
              expect(report.teamCount).toBe(3);
              expect((await activity.saveReport(rep, reportInput)).id).toBe(
                report.id,
              );
              expect(
                (await activity.teamReports(ahmad, rx1.id)).items[0].snapshot,
              ).toMatchObject({ total: 1 });
              expect(
                (await activity.teamReports(tarek, otc.id)).items[0].snapshot,
              ).toMatchObject({ total: 1 });
              await expect(
                activity.teamReports(ahmad, otc.id),
              ).rejects.toThrow();
              await expect(
                activity.teamReports(outsider, rx1.id),
              ).rejects.toThrow();
              await expect(
                activity.saveReport(rep, { ...reportInput, period: 'WEEKLY' }),
              ).rejects.toThrow();
              expect((await activity.leaves(rep)).balance).toBe(18);
              expect((await activity.leaves(rep)).approver).toBeNull();
              await tx.repProfile.create({
                data: {
                  organizationId: org.id,
                  userId: rep.id,
                  leaveApproverId: ahmad.id,
                },
              });
              const leaveInput = {
                clientRef: randomUUID(),
                type: 'ANNUAL' as const,
                from: today,
                to: today,
                reason: 'test leave',
              };
              const attachment = {
                originalname: 'request.pdf',
                mimetype: 'application/pdf',
                buffer: Buffer.from('%PDF-test'),
                size: 9,
              };
              const leave = await activity.requestLeave(
                rep,
                leaveInput,
                attachment,
              );
              expect(leave.routed).toBe(true);
              expect(
                (await activity.requestLeave(rep, leaveInput, attachment)).id,
              ).toBe(leave.id);
              const list = await activity.leaves(rep);
              expect(list.items[0]).toMatchObject({
                requestedDays: 1,
                status: 'PENDING',
                approver: { id: ahmad.id },
              });
              const attachmentId = list.items[0].attachment!.id;
              expect((await activity.attachment(rep, attachmentId)).name).toBe(
                'request.pdf',
              );
              await expect(
                activity.attachment(tarek, attachmentId),
              ).rejects.toThrow();
              await expect(
                activity.attachment(outsider, attachmentId),
              ).rejects.toThrow();
              await expect(
                activity.requestLeave(
                  rep,
                  { ...leaveInput, type: 'SICK' },
                  attachment,
                ),
              ).rejects.toThrow();
              await expect(
                activity.requestLeave(rep, {
                  ...leaveInput,
                  clientRef: randomUUID(),
                  from: '2026-02-30',
                }),
              ).rejects.toThrow();
              await expect(
                activity.requestLeave(
                  rep,
                  { ...leaveInput, clientRef: randomUUID() },
                  { ...attachment, buffer: Buffer.from('<script>') },
                ),
              ).rejects.toThrow();
              expect(
                (await manager.leaves(ahmad)).items.map((l) => l.id),
              ).toContain(leave.id);
              expect((await manager.leaves(tarek)).items).toEqual([]);
              await expect(
                manager.decideLeave(tarek, leave.id, 'APPROVED'),
              ).rejects.toThrow();
              await expect(
                manager.decideLeave(outsider, leave.id, 'APPROVED'),
              ).rejects.toThrow();
              const notificationCount = await tx.notification.count({
                where: { userId: rep.id },
              });
              await manager.decideLeave(ahmad, leave.id, 'APPROVED');
              await manager.decideLeave(ahmad, leave.id, 'APPROVED');
              expect(
                await tx.notification.count({ where: { userId: rep.id } }),
              ).toBe(notificationCount + 1);
              await expect(
                manager.decideLeave(ahmad, leave.id, 'REJECTED'),
              ).rejects.toThrow();
              expect(
                (await manager.reports(ahmad)).items
                  .map((r) => r.teamId)
                  .sort(),
              ).toEqual([rx1.id, rx2.id].sort());
              expect((await manager.reports(outsider)).items).toEqual([]);
              expect((await activity.leaves(rep)).balance).toBe(17);
              const reports = new TeamReportService(db);
              const a = await reports.visits(ahmad, rx1.id, cycle.id, {
                limit: 30,
              });
              const b = await reports.visits(tarek, otc.id, cycle.id, {
                limit: 30,
              });
              expect(a.items[0].id).toBe(b.items[0].id);
              expect(
                (await reports.visits(ahmad, rx2.id, cycle.id, { limit: 30 }))
                  .items[0].id,
              ).toBe(a.items[0].id);
              expect(a.items[0].products.map((p) => p.id)).toEqual([
                productA.id,
              ]);
              expect(b.items[0].products.map((p) => p.id)).toEqual([
                productB.id,
              ]);
              expect(
                (await reports.coverage(ahmad, rx1.id, cycle.id))
                  .creditedVisits,
              ).toBe(1);
              expect(
                (await reports.coverage(tarek, otc.id, cycle.id))
                  .creditedVisits,
              ).toBe(1);
              expect(
                await reports.companySummary(owner, cycle.id),
              ).toMatchObject({
                physicalVisits: 1,
                allocatedVisits: 1,
                teamCredits: 3,
                unallocatedVisits: 0,
              });
              await expect(
                reports.visits(ahmad, otc.id, cycle.id, { limit: 30 }),
              ).rejects.toThrow();
              await expect(
                reports.coverage(outsider, rx1.id, cycle.id),
              ).rejects.toThrow();
              await expect(
                reports.companySummary(outsider, cycle.id),
              ).rejects.toThrow();
              await expect(
                reports.visits(ahmad, rx1.id, cycle.id, {
                  limit: 30,
                  cursor: b.items[0].creditId,
                }),
              ).rejects.toThrow();
              // Removing team product links must not rewrite already recorded attribution.
              await tx.teamProduct.deleteMany({ where: { teamId: rx1.id } });
              expect(
                (
                  await reports.visits(ahmad, rx1.id, cycle.id, { limit: 30 })
                ).items[0].products.map((p) => p.id),
              ).toEqual([productA.id]);
              const teamEditor = new TeamManagementService(db);
              const authorizedManager = {
                ...ahmad,
                permissions: [
                  ...ahmad.permissions,
                  'teams.view',
                  'teams.configure_own',
                  'teams.assign_own',
                ],
              };
              const managedTeam = await createTeam(
                'managed test',
                ahmad.id,
                productA.id,
              );
              await expect(
                teamEditor.options(
                  { ...outsider, permissions: ['teams.view'] },
                  managedTeam.id,
                ),
              ).rejects.toThrow();
              await expect(
                teamEditor.update(ahmad, managedTeam.id, {
                  name: 'blocked',
                  specialtyIds: [specialty.id],
                  productIds: [productA.id],
                }),
              ).rejects.toThrow();
              await expect(
                teamEditor.update(authorizedManager, otc.id, {
                  name: 'blocked',
                  specialtyIds: [],
                  productIds: [],
                }),
              ).rejects.toThrow();
              await teamEditor.update(authorizedManager, managedTeam.id, {
                name: 'updated managed team',
                specialtyIds: [specialty.id],
                productIds: [productA.id],
              });
              expect(
                (await teamEditor.options(authorizedManager, managedTeam.id))
                  .team.name,
              ).toBe('updated managed team');
              await expect(
                teamEditor.saveReps(authorizedManager, managedTeam.id, {
                  repCycleProfileIds: [randomUUID()],
                }),
              ).rejects.toThrow();
              expect(
                (
                  await teamEditor.reps(authorizedManager, managedTeam.id)
                ).items.some((p) => p.id === profile.id),
              ).toBe(true);
              expect(
                await teamEditor.saveReps(authorizedManager, managedTeam.id, {
                  repCycleProfileIds: [profile.id],
                }),
              ).toEqual({ configured: 1 });
              const configuredPeriod =
                await tx.repCycleTeamPeriod.findFirstOrThrow({
                  where: {
                    teamId: managedTeam.id,
                    repCycleProfileId: profile.id,
                  },
                  include: { scopeTargets: true, scopeProducts: true },
                });
              expect(
                configuredPeriod.scopeProducts.map((p) => p.productId),
              ).toEqual([productA.id]);
              expect(
                configuredPeriod.scopeTargets.every(
                  (t) => t.repCycleTargetId !== null,
                ),
              ).toBe(true);
              expect(
                await tx.visitTeamCredit.count({
                  where: {
                    teamScopeTarget: { teamPeriodId: configuredPeriod.id },
                  },
                }),
              ).toBe(0);
              expect(
                await teamEditor.saveReps(authorizedManager, managedTeam.id, {
                  repCycleProfileIds: [profile.id],
                }),
              ).toEqual({ configured: 0 });
              await expect(
                teamEditor.saveReps(authorizedManager, rx1.id, {
                  repCycleProfileIds: [],
                }),
              ).rejects.toThrow();
              await teamEditor.saveReps(authorizedManager, managedTeam.id, {
                repCycleProfileIds: [],
              });
              expect(
                await tx.repCycleTeamPeriod.count({
                  where: { teamId: managedTeam.id },
                }),
              ).toBe(0);
              expect(
                (
                  await teamEditor.reps(authorizedManager, managedTeam.id)
                ).items.some((p) => p.id === profile.id),
              ).toBe(true);
              await tx.fieldTarget.updateMany({
                where: { organizationId: org.id },
                data: { targetClassId: targetClass.id },
              });
              await tx.cycleClassRule.create({
                data: {
                  cycleId: cycle.id,
                  targetClassId: targetClass.id,
                  requiredVisits: 3,
                },
              });
              await tx.role.upsert({
                where: { code: 'REP' },
                create: { code: 'REP', name: 'Representative' },
                update: {},
              });
              const repEditor = new RepManagementService(db);
              const repManager = {
                ...authorizedManager,
                permissions: [
                  ...authorizedManager.permissions,
                  'users.view',
                  'users.manage_own',
                ],
              };
              const newRepData = {
                name: 'New scoped rep',
                username: `test.${randomUUID()}`,
                password: 'Fixture-only!Pass2026',
                teamId: managedTeam.id,
                areaIds: [area.id],
                productIds: [productA.id],
                specialtyIds: [specialty.id],
                dailyVisitTarget: 6,
              };
              await expect(
                repEditor.create(
                  { ...outsider, permissions: ['users.manage_own'] },
                  newRepData,
                ),
              ).rejects.toThrow();
              const created = await repEditor.create(repManager, newRepData);
              const account = await tx.user.findUniqueOrThrow({
                where: { id: created.id },
                include: { roles: { include: { role: true } } },
              });
              expect(
                await bcrypt.compare(newRepData.password, account.passwordHash),
              ).toBe(true);
              expect(account.roles.map((r) => r.role.code)).toEqual(['REP']);
              expect(created.targetCount).toBe(1);
              const createdProfile = await tx.repCycleProfile.findFirstOrThrow({
                where: { repId: created.id },
                include: {
                  targets: true,
                  teamPeriods: { include: { scopeSpecialties: true } },
                },
              });
              expect(createdProfile.targets[0].targetClassId).toBe(
                targetClass.id,
              );
              expect(createdProfile.targets[0].requiredVisits).toBe(3);
              expect(
                createdProfile.teamPeriods[0].scopeSpecialties.map(
                  (s) => s.specialtyId,
                ),
              ).toEqual([specialty.id]);
              const newAuth = {
                ...rep,
                id: created.id!,
                name: newRepData.name,
              };
              expect(
                (
                  await repService.targets(newAuth, { type: 'DOCTOR' })
                ).items.map((t) => t.id),
              ).toEqual([doctor.id]);
              await repEditor.update(repManager, created.id!, {
                ...newRepData,
                name: 'Edited rep',
                areaIds: [area.id, area2.id],
              });
              expect(
                (await repEditor.options(repManager, created.id!)).rep?.name,
              ).toBe('Edited rep');
              const previousOtherTeam = await tx.repCycleTeamPeriod.findMany({
                where: { teamId: otc.id, repCycleProfileId: profile.id },
              });
              await repEditor.update(repManager, rep.id, {
                name: rep.name,
                teamId: rx2.id,
                areaIds: [area.id],
                productIds: [productA.id],
                specialtyIds: [specialty.id],
                dailyVisitTarget: 8,
              });
              expect(
                await tx.repCycleTeamPeriod.findMany({
                  where: { teamId: otc.id, repCycleProfileId: profile.id },
                }),
              ).toEqual(previousOtherTeam);
              expect(
                await tx.visitTeamCredit.count({
                  where: { visit: { organizationId: org.id } },
                }),
              ).toBe(3);
              await expect(
                repEditor.update(repManager, rep.id, {
                  name: 'not allowed',
                  teamId: rx2.id,
                  areaIds: [area.id],
                  productIds: [productA.id],
                  specialtyIds: [specialty.id],
                  dailyVisitTarget: 8,
                }),
              ).rejects.toThrow();
              const auditText = JSON.stringify(
                await tx.auditLog.findMany({
                  where: {
                    organizationId: org.id,
                    entityType: 'RepCycleProfile',
                  },
                }),
              );
              expect(auditText).not.toContain(newRepData.password);
              expect(auditText).not.toContain(account.passwordHash);
              const catalog = new TargetManagementService(db);
              const catalogManager = {
                ...repManager,
                permissions: [
                  ...repManager.permissions,
                  'targets.view',
                  'targets.manage',
                ],
              };
              const targetInput = {
                type: 'DOCTOR' as const,
                name: 'Imported doctor',
                areaId: area.id,
                targetClassId: targetClass.id,
                specialtyId: specialty.id,
              };
              await expect(
                catalog.save(
                  { ...outsider, permissions: ['targets.manage'] },
                  targetInput,
                ),
              ).rejects.toThrow();
              const createdTarget = await catalog.save(
                catalogManager,
                targetInput,
              );
              expect(
                (await catalog.list(catalogManager, 'DOCTOR')).items.some(
                  (t) => t.id === createdTarget.id,
                ),
              ).toBe(true);
              expect(
                (
                  await repService.targets(newAuth, { type: 'DOCTOR' })
                ).items.some((t) => t.id === createdTarget.id),
              ).toBe(true);
              expect(
                await tx.teamScopeTarget.count({
                  where: {
                    repCycleTarget: {
                      targetId: createdTarget.id,
                      repCycleProfileId: createdProfile.id,
                    },
                  },
                }),
              ).toBe(1);
              await catalog.save(
                catalogManager,
                { ...targetInput, name: 'Edited imported doctor' },
                createdTarget.id,
              );
              const newRound = await repService.register(newAuth, {
                clientRef: randomUUID(),
                cycleId: cycle.id,
                type: 'DOCTOR',
                areaIds: [area.id],
                targetIds: [createdTarget.id],
                productIds: [productA.id],
                visitDate: today,
              });
              expect(
                (await manager.workspace(ahmad)).rounds.some((r) =>
                  r.visits.some((v) => v.roundId === newRound.id),
                ),
              ).toBe(true);
              expect(
                (await manager.workspace(tarek)).rounds.some((r) =>
                  r.visits.some((v) => v.roundId === newRound.id),
                ),
              ).toBe(false);
              const teamSpecialties = await tx.teamSpecialty.findMany({
                where: { teamId: { in: [rx1.id, rx2.id] } },
              });
              await tx.teamSpecialty.deleteMany({
                where: { teamId: { in: [rx1.id, rx2.id] } },
              });
              expect(
                (await catalog.options(catalogManager)).specialties.some(
                  (s) => s.id === specialty.id,
                ),
              ).toBe(true);
              const noTeamSetup = await catalog.save(catalogManager, {
                ...targetInput,
                name: 'Catalog without team setup',
              });
              expect(noTeamSetup.id).toBeTruthy();
              await tx.teamSpecialty.createMany({ data: teamSpecialties });
              const classB = await tx.targetClass.create({
                data: { organizationId: org.id, code: 'B', name: 'B', rank: 2 },
              });
              await catalog.save(
                catalogManager,
                { ...targetInput, name: doctor.name, targetClassId: classB.id },
                doctor.id,
              );
              expect(
                (
                  await tx.fieldTarget.findUniqueOrThrow({
                    where: { id: doctor.id },
                  })
                ).targetClassId,
              ).toBe(classB.id);
              expect(
                (
                  await tx.repCycleTarget.findFirstOrThrow({
                    where: {
                      repCycleProfileId: profile.id,
                      targetId: doctor.id,
                    },
                  })
                ).targetClassId,
              ).toBe(targetClass.id);
              await expect(
                catalog.save(
                  catalogManager,
                  { ...targetInput, name: doctor.name, areaId: area2.id },
                  doctor.id,
                ),
              ).rejects.toThrow();
              async function workbook(rows: string[][]) {
                const book = new ExcelJS.Workbook();
                const sheet = book.addWorksheet('Doctors');
                sheet.addRow([
                  'Name',
                  'Specailist',
                  'Doctor geo name',
                  'classification',
                ]);
                rows.forEach((row) => sheet.addRow(row));
                return {
                  originalname: 'doctors.xlsx',
                  buffer: Buffer.from(await book.xlsx.writeBuffer()),
                };
              }
              const uploaded = await workbook([
                ['Excel doctor', 'cardiology', 'area 1', 'A'],
              ]);
              expect(
                await catalog.importDoctors(catalogManager, uploaded),
              ).toEqual({ imported: 1, updated: 0, replayed: false });
              expect(
                await catalog.importDoctors(catalogManager, uploaded),
              ).toEqual({ imported: 0, updated: 0, replayed: true });
              const exportedBook = new ExcelJS.Workbook();
              const exported = await catalog.exportDoctors(catalogManager, false, 'Excel doctor');
              await exportedBook.xlsx.load(exported as unknown as Parameters<typeof exportedBook.xlsx.load>[0]);
              const exportedSheet = exportedBook.worksheets[0];
              expect(exportedSheet.rowCount).toBe(2);
              expect(exportedSheet.getCell('C2').text).toBe(area.id);
              const exportedId = exportedSheet.getCell('A2').text;
              exportedSheet.getCell('B2').value = '=literal doctor name';
              exportedSheet.getCell('I2').value = '009631234567';
              exportedSheet.getCell('K2').value = 'updated from Excel';
              expect(await catalog.importDoctors(catalogManager, {
                originalname: 'roundtrip.xlsx',
                buffer: Buffer.from(await exportedBook.xlsx.writeBuffer()),
              })).toEqual({ imported: 0, updated: 1, replayed: false });
              const updatedExcelDoctor = await tx.fieldTarget.findUniqueOrThrow({ where: { id: exportedId }, include: { doctorProfile: true } });
              expect(updatedExcelDoctor.name).toBe('=literal doctor name');
              expect(updatedExcelDoctor.phone).toBe('009631234567');
              expect(updatedExcelDoctor.doctorProfile?.notes).toBe('updated from Excel');
              const formulaBook = new ExcelJS.Workbook();
              const literalExport = await catalog.exportDoctors(catalogManager, false, '=literal doctor name');
              await formulaBook.xlsx.load(literalExport as unknown as Parameters<typeof formulaBook.xlsx.load>[0]);
              expect(formulaBook.worksheets[0].getCell('B2').type).toBe(ExcelJS.ValueType.String);
              const scopedBook = new ExcelJS.Workbook();
              const scopedExport = await catalog.exportDoctors({ ...catalogManager, organizationId: otherOrg.id });
              await scopedBook.xlsx.load(scopedExport as unknown as Parameters<typeof scopedBook.xlsx.load>[0]);
              expect(scopedBook.worksheets[0].rowCount).toBe(1);
              // Restore the fixture name used by the duplicate-row rollback checks below.
              await tx.fieldTarget.update({ where: { id: exportedId }, data: { name: 'Excel doctor' } });
              await expect(
                catalog.importDoctors(
                  catalogManager,
                  await workbook([
                    ['Invalid doctor', 'unknown', 'area 1', 'A'],
                  ]),
                ),
              ).rejects.toThrow();
              expect(
                await tx.fieldTarget.count({
                  where: { organizationId: org.id, name: 'Invalid doctor' },
                }),
              ).toBe(0);
              await expect(
                catalog.importDoctors(catalogManager, {
                  originalname: 'bad.xlsx',
                  buffer: Buffer.from('invalid'),
                }),
              ).rejects.toThrow();
              await expect(
                catalog.importDoctors(
                  catalogManager,
                  await workbook([
                    ['Should roll back', 'cardiology', 'area 1', 'A'],
                    ['Excel doctor', 'cardiology', 'area 1', 'A'],
                  ]),
                ),
              ).rejects.toThrow();
              expect(
                await tx.fieldTarget.count({
                  where: { organizationId: org.id, name: 'Should roll back' },
                }),
              ).toBe(0);
              const areaManager = new AreaManagementService(db);
              const areaUser = {
                ...ahmad,
                permissions: [...ahmad.permissions, 'areas.manage_own'],
              };
              const group = await areaManager.save(
                areaUser,
                { name: 'West', provinceId: province.id },
                'group',
              );
              await areaManager.save(
                areaUser,
                { name: area.name, provinceId: province.id, groupId: group.id },
                'area',
                area.id,
              );
              expect(
                (await areaManager.catalog(areaUser)).areas.find(
                  (a) => a.id === area.id,
                )?.groupId,
              ).toBe(group.id);
              expect(
                await tx.visit.count({
                  where: {
                    target: { locations: { some: { areaId: area.id } } },
                  },
                }),
              ).toBeGreaterThan(0);
              await expect(
                areaManager.save(
                  { ...outsider, permissions: ['areas.manage_own'] },
                  { name: 'Blocked', provinceId: province.id },
                  'group',
                ),
              ).rejects.toThrow();
              const addedArea = await areaManager.save(
                areaUser,
                {
                  name: 'New unassigned area',
                  provinceId: province.id,
                  groupId: group.id,
                },
                'area',
              );
              const newAreaWorkspace = await manager.workspace(areaUser);
              expect(
                newAreaWorkspace.areas.find((a) => a.id === addedArea.id),
              ).toMatchObject({ coverage: 0, targets: 0, counts: { reps: 0 } });
              expect(
                (await repService.workspace(newAuth)).areas.some(
                  (a) => a.id === addedArea.id,
                ),
              ).toBe(false);
              const otherProvince = await tx.province.create({
                data: { organizationId: org.id, name: 'Other province' },
              });
              const otherGroup = await tx.areaGroup.create({
                data: { provinceId: otherProvince.id, name: 'Other group' },
              });
              await expect(
                areaManager.save(
                  areaUser,
                  {
                    name: area.name,
                    provinceId: province.id,
                    groupId: otherGroup.id,
                  },
                  'area',
                  area.id,
                ),
              ).rejects.toThrow();
              await areaManager.save(
                areaUser,
                { name: area.name, provinceId: province.id, groupId: null },
                'area',
                area.id,
              );
              expect(
                (await areaManager.catalog(areaUser)).areas.find(
                  (a) => a.id === area.id,
                )?.groupId,
              ).toBeNull();
              const teamCreator = new TeamManagementService(db);
              const creator = {
                ...ahmad,
                permissions: [...ahmad.permissions, 'teams.create_own'],
              };
              const newTeamDto = {
                name: 'Created RX',
                provinceId: province.id,
                specialtyIds: [specialty.id],
                productIds: [productA.id],
              };
              const newTeam = await teamCreator.create(creator, newTeamDto);
              expect(
                (await manager.workspace(creator)).teams.some(
                  (t) => t.id === newTeam.id,
                ),
              ).toBe(true);
              expect(
                (await manager.workspace(tarek)).teams.some(
                  (t) => t.id === newTeam.id,
                ),
              ).toBe(false);
              expect(
                await tx.teamMember.count({
                  where: {
                    teamId: newTeam.id,
                    userId: ahmad.id,
                    isManager: true,
                  },
                }),
              ).toBe(1);
              await expect(
                teamCreator.create(
                  { ...outsider, permissions: ['teams.create_own'] },
                  newTeamDto,
                ),
              ).rejects.toThrow();
              await expect(
                teamCreator.create(creator, {
                  ...newTeamDto,
                  name: 'Wrong province',
                  provinceId: otherProvince.id,
                }),
              ).rejects.toThrow();
              await expect(
                teamCreator.create(creator, {
                  ...newTeamDto,
                  name: 'Invalid product',
                  productIds: [randomUUID()],
                }),
              ).rejects.toThrow();
              const settingsService = new CycleSettingsService(db);
              const settingsUser = {
                ...ahmad,
                permissions: [...ahmad.permissions, 'cycles.configure'],
              };
              await tx.cycleWorkingDayRule.createMany({
                data: Array.from({ length: 7 }, (_, weekday) => ({
                  cycleId: cycle.id,
                  weekday,
                  isWorking: true,
                  workloadFactor: 1,
                })),
                skipDuplicates: true,
              });
              const settingsDto = {
                startsOn: cycle.startsAt.toISOString().slice(0, 10),
                endsOn: cycle.endsAt.toISOString().slice(0, 10),
                frequency: [{ id: targetClass.id, requiredVisits: 9 }],
                workingDays: Array.from({ length: 7 }, (_, weekday) => ({
                  weekday,
                  isWorking: weekday !== 5,
                })),
              };
              const assignedBefore = await tx.repCycleTarget.findMany({
                where: { repCycleProfileId: profile.id },
                select: { id: true, requiredVisits: true },
                orderBy: { id: 'asc' },
              });
              await expect(
                settingsService.save(ahmad, cycle.id, settingsDto),
              ).rejects.toThrow();
              await expect(
                settingsService.save(
                  { ...outsider, permissions: ['cycles.configure'] },
                  cycle.id,
                  settingsDto,
                ),
              ).rejects.toThrow();
              await settingsService.save(settingsUser, cycle.id, settingsDto);
              expect(
                await tx.repCycleTarget.findMany({
                  where: { repCycleProfileId: profile.id },
                  select: { id: true, requiredVisits: true },
                  orderBy: { id: 'asc' },
                }),
              ).toEqual(assignedBefore);
              expect(
                (
                  await tx.cycleClassRule.findUniqueOrThrow({
                    where: {
                      cycleId_targetClassId: {
                        cycleId: cycle.id,
                        targetClassId: targetClass.id,
                      },
                    },
                  })
                ).requiredVisits,
              ).toBe(9);
              const todayOverride = await tx.cycleDayOverride.findUniqueOrThrow(
                {
                  where: {
                    cycleId_date: {
                      cycleId: cycle.id,
                      date: new Date(today + 'T00:00:00Z'),
                    },
                  },
                },
              );
              expect(todayOverride.isWorking).toBe(true);
              await settingsService.save(settingsUser, cycle.id, {
                ...settingsDto,
                workingDays: settingsDto.workingDays.map((d) => ({
                  ...d,
                  isWorking: d.weekday !== 6,
                })),
              });
              expect(
                await tx.cycleDayOverride.findUniqueOrThrow({
                  where: { id: todayOverride.id },
                }),
              ).toEqual(todayOverride);
              await expect(
                settingsService.save(settingsUser, cycle.id, {
                  ...settingsDto,
                  endsOn: settingsDto.startsOn,
                }),
              ).rejects.toThrow();
              await tx.organizationSettings.upsert({
                where: { organizationId: org.id },
                create: { organizationId: org.id, defaultAnnualLeaveDays: 12 },
                update: { defaultAnnualLeaveDays: 12 },
              });
              const balanceService = new LeaveBalanceService(
                db,
                new RepActivityService(db),
              );
              const balanceManager = {
                ...ahmad,
                permissions: [...ahmad.permissions, 'leaves.manage_balances'],
              };
              const balanceOwner = {
                ...balanceManager,
                permissions: [
                  ...balanceManager.permissions,
                  'leaves.configure',
                ],
              };
              const beforeLeaves = await tx.leaveRequest.count({
                where: { requesterId: rep.id },
              });
              const beforeBalance = (
                await balanceService.get(balanceManager, rep.id)
              ).remainingDays;
              await balanceService.save(
                balanceManager,
                { allocatedDays: 15 },
                rep.id,
              );
              expect(
                (await balanceService.get(balanceManager, rep.id))
                  .remainingDays,
              ).toBe(beforeBalance + 3);
              expect(
                (await new RepActivityService(db).leaves(rep)).balance,
              ).toBe(beforeBalance + 3);
              await expect(
                balanceService.save(
                  { ...tarek, permissions: ['leaves.manage_balances'] },
                  { allocatedDays: 99 },
                  rep.id,
                ),
              ).rejects.toThrow();
              await expect(
                balanceService.save(balanceManager, { allocatedDays: 20 }),
              ).rejects.toThrow();
              await expect(
                balanceService.save(
                  {
                    ...outsider,
                    permissions: ['leaves.manage_balances', 'leaves.configure'],
                  },
                  { allocatedDays: 20 },
                  rep.id,
                ),
              ).rejects.toThrow();
              await balanceService.save(balanceOwner, { allocatedDays: 20 });
              expect(
                (await balanceService.get(balanceManager, rep.id))
                  .allocatedDays,
              ).toBe(15);
              expect(
                await tx.leaveRequest.count({ where: { requesterId: rep.id } }),
              ).toBe(beforeLeaves);
              await tx.organizationSettings.update({
                where: { organizationId: org.id },
                data: { roundEditWindowHours: 24 },
              });
              const editorUser = {
                ...newAuth,
                permissions: [
                  ...newAuth.permissions,
                  'rounds.manage_own',
                  'visits.edit_own',
                ],
              };
              const editInput = {
                clientRef: randomUUID(),
                cycleId: cycle.id,
                type: 'DOCTOR' as const,
                areaIds: [area.id],
                targetIds: [doctor.id],
                productIds: [productA.id],
                visitDate: today,
                notes: 'edited',
              };
              const countBeforeEdit = await tx.fieldRound.count();
              await repService.register(editorUser, editInput, {
                id: newRound.id,
                revision: 0,
              });
              await repService.register(editorUser, editInput, {
                id: newRound.id,
                revision: 0,
              });
              expect(await tx.fieldRound.count()).toBe(countBeforeEdit);
              expect(
                await tx.visit.count({
                  where: { roundId: newRound.id, status: 'COMPLETED' },
                }),
              ).toBe(1);
              expect(
                await tx.visitTeamCredit.count({
                  where: {
                    visit: { roundId: newRound.id, status: 'CANCELLED' },
                  },
                }),
              ).toBe(0);
              const editedHistory = (
                await repService.history(editorUser)
              ).items.find((r) => r.roundId === newRound.id)!;
              expect(editedHistory.targets.map((t) => t.id)).toEqual([
                doctor.id,
              ]);
              expect(editedHistory.notes).toBe('edited');
              expect(editedHistory.revision).toBe(1);
              await expect(
                repService.register(
                  editorUser,
                  { ...editInput, clientRef: randomUUID() },
                  { id: newRound.id, revision: 0 },
                ),
              ).rejects.toThrow();
              await expect(
                repService.register(
                  { ...outsider, permissions: editorUser.permissions },
                  { ...editInput, clientRef: randomUUID() },
                  { id: newRound.id, revision: 1 },
                ),
              ).rejects.toThrow();
              await tx.fieldRound.update({
                where: { id: newRound.id },
                data: { createdAt: new Date(Date.now() - 25 * 3600000) },
              });
              await expect(
                repService.register(
                  editorUser,
                  { ...editInput, clientRef: randomUUID() },
                  { id: newRound.id, revision: 1 },
                ),
              ).rejects.toThrow('انتهت مهلة');
              await tx.fieldRound.update({
                where: { id: newRound.id },
                data: { createdAt: new Date() },
              });
              const detail = await repService.editDetails(
                editorUser,
                newRound.id,
              );
              expect(detail.targets.map((t) => t!.id)).toEqual([doctor.id]);
              await expect(
                repService.cancel(
                  { ...outsider, permissions: editorUser.permissions },
                  newRound.id,
                  1,
                ),
              ).rejects.toThrow();
              await expect(
                repService.cancel(editorUser, newRound.id, 0),
              ).rejects.toThrow();
              await repService.cancel(editorUser, newRound.id, 1);
              await repService.cancel(editorUser, newRound.id, 1);
              expect(
                await tx.visit.count({
                  where: { roundId: newRound.id, status: 'COMPLETED' },
                }),
              ).toBe(0);
              expect(
                await tx.visitTeamCredit.count({
                  where: { visit: { roundId: newRound.id } },
                }),
              ).toBe(0);
              expect(
                (await manager.workspace(ahmad)).rounds.some((r) =>
                  r.visits.some((v) => v.roundId === newRound.id),
                ),
              ).toBe(false);
              const cancelled = (
                await repService.history(editorUser)
              ).items.find((r) => r.roundId === newRound.id)!;
              expect(cancelled.status).toBe('CANCELLED');
              expect(cancelled.canEdit).toBe(false);
              expect(cancelled.targets.map((t) => t.id)).toEqual([doctor.id]);
              throw rollback;
            },
            { timeout: 30000 },
          ),
        ).rejects.toBe(rollback);
        expect(await prisma.organization.count()).toBe(before);
      } finally {
        await prisma.$disconnect();
      }
    }, 40000);
  },
);
