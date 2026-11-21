import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set.");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

const DEFAULT_PASSWORD = "MedRepDev!2026";

const permissions = [
  ["system.manage", "إدارة النظام"],
  ["organizations.view", "عرض الشركات"],
  ["organizations.manage", "إدارة الشركات"],
  ["users.view", "عرض المستخدمين"],
  ["users.manage", "إدارة المستخدمين"],
  ["users.manage_own", "إدارة مندوبي الفرق المدارة"],
  ["teams.view", "عرض الفرق"],
  ["teams.manage", "إدارة الفرق"],
  ["teams.create_own", "إنشاء فرق ضمن المحافظات المدارة"],
  ["teams.configure_own", "تعديل الفرق المدارة"],
  ["teams.assign_own", "إدارة تكليفات الفرق المدارة"],
  ["areas.view", "عرض المحافظات والمناطق"],
  ["areas.manage_own", "إدارة مناطق المحافظات المسندة"],
  ["areas.manage", "إدارة المحافظات والمناطق"],
  ["specialties.view", "عرض الاختصاصات"],
  ["specialties.manage", "إدارة الاختصاصات"],
  ["targets.view", "عرض الأطباء والصيدليات والمشافي"],
  ["targets.manage", "إدارة الأطباء والصيدليات والمشافي"],
  ["targets.delete", "حذف الأطباء والصيدليات والمشافي"],
  ["products.view", "عرض المنتجات"],
  ["products.manage", "إدارة المنتجات"],
  ["cycles.view", "عرض الدورات"],
  ["cycles.manage", "إدارة الدورات"],
  ["cycles.configure", "تعديل قواعد التغطية والدورة"],
  ["rounds.create", "بدء جولة"],
  ["rounds.manage_own", "إدارة الجولات الشخصية"],
  ["rounds.view_team", "عرض جولات الفريق"],
  ["visits.create", "إنشاء زيارة"],
  ["visits.view_own", "عرض الزيارات الشخصية"],
  ["visits.edit_own", "تعديل الزيارات الشخصية"],
  ["visits.view_team", "عرض زيارات الفريق"],
  ["visits.view_all", "عرض جميع الزيارات"],
  ["reports.view_own", "عرض التقارير الشخصية"],
  ["reports.view_team", "عرض تقارير الفريق"],
  ["reports.view_national", "عرض التقارير الوطنية"],
  ["analytics.view_own", "عرض التحليلات الشخصية"],
  ["analytics.view_team", "عرض تحليلات الفريق"],
  ["analytics.view_national", "عرض التحليلات الوطنية"],
  ["leaves.configure", "إعداد رصيد إجازات الشركة"],
  ["leaves.manage_balances", "تعديل استحقاق إجازات المندوب"],
  ["leaves.request", "طلب إجازة"],
  ["leaves.view_own", "عرض الإجازات الشخصية"],
  ["leaves.approve_team", "الموافقة على إجازات الفريق"],
  ["leaves.view_all", "عرض جميع الإجازات"],
  ["notifications.view_own", "عرض الإشعارات الشخصية"],
  ["audit.view", "عرض سجل التدقيق"],
] as const;

const roleDefinitions = {
  COMPANY_STAFF: [],
  SUPER_ADMIN: permissions.map(([code]) => code),
  NATIONAL_MANAGER: [
    "organizations.view",
    "users.view",
    "users.manage_own",
    "users.manage",
    "teams.view",
    "teams.configure_own",
    "teams.create_own",
    "teams.assign_own",
    "teams.manage",
    "areas.view",
    "areas.manage_own",
    "areas.manage",
    "specialties.view",
    "specialties.manage",
    "targets.view",
    "targets.manage",
    "targets.delete",
    "products.view",
    "products.manage",
    "cycles.view",
    "cycles.manage",
    "cycles.configure",
    "rounds.view_team",
    "visits.view_team",
    "visits.view_all",
    "reports.view_team",
    "reports.view_national",
    "analytics.view_team",
    "analytics.view_national",
    "leaves.view_all",
    "leaves.configure",
    "leaves.manage_balances",
    "notifications.view_own",
    "audit.view",
  ],
  TEAM_MANAGER: [
    "users.view",
    "users.manage_own",
    "teams.view",
    "teams.configure_own",
    "teams.create_own",
    "teams.assign_own",
    "areas.view",
    "areas.manage_own",
    "specialties.view",
    "targets.view",
    "targets.manage",
    "targets.delete",
    "products.view",
    "cycles.view",
    "rounds.create",
    "rounds.manage_own",
    "rounds.view_team",
    "visits.create",
    "visits.view_own",
    "visits.edit_own",
    "visits.view_team",
    "reports.view_own",
    "reports.view_team",
    "analytics.view_own",
    "analytics.view_team",
    "leaves.request",
    "leaves.view_own",
    "leaves.approve_team",
    "leaves.manage_balances",
    "notifications.view_own",
  ],
  REP: [
    "areas.view",
    "specialties.view",
    "targets.view",
    "products.view",
    "cycles.view",
    "rounds.create",
    "rounds.manage_own",
    "visits.create",
    "visits.view_own",
    "visits.edit_own",
    "reports.view_own",
    "analytics.view_own",
    "leaves.request",
    "leaves.view_own",
    "notifications.view_own",
  ],
} as const;

const roleNames: Record<keyof typeof roleDefinitions, string> = {
  COMPANY_STAFF: "Company Staff",
  SUPER_ADMIN: "Super Admin",
  NATIONAL_MANAGER: "National Manager",
  TEAM_MANAGER: "Team Manager",
  REP: "Medical Representative",
};

const provinces = [
  "دمشق",
  "ريف دمشق",
  "حلب",
  "حمص",
  "حماة",
  "اللاذقية",
  "طرطوس",
  "إدلب",
  "درعا",
  "السويداء",
  "القنيطرة",
  "دير الزور",
  "الرقة",
  "الحسكة",
];

const aleppoAreas = [
  "الحمدانية",
  "الفرقان",
  "الموكامبو",
  "حلب الجديدة",
  "الجميلية",
];

const specialties = [
  "القلبية",
  "الداخلية",
  "الغدد والسكري",
  "العصبية",
  "النفسية",
  "الكلية",
  "الأطفال",
  "النسائية والتوليد",
  "الجلدية",
  "العظمية",
  "الجراحة العامة",
  "الصدرية",
  "الهضمية",
  "المسالك البولية",
  "الأنف والأذن والحنجرة",
  "العيون",
];

async function ensureRolePermission(roleId: string, permissionId: string) {
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId, permissionId } },
    update: {},
    create: { roleId, permissionId },
  });
}

async function assignRole(userId: string, roleId: string) {
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId, roleId } },
    update: {},
    create: { userId, roleId },
  });
}

async function ensureActiveTeamMember(teamId: string, userId: string, isManager: boolean) {
  const current = await prisma.teamMember.findFirst({
    where: { teamId, userId, endedAt: null },
  });

  if (!current) {
    await prisma.teamMember.create({ data: { teamId, userId, isManager } });
    return;
  }

  if (current.isManager !== isManager) {
    await prisma.teamMember.update({
      where: { id: current.id },
      data: { isManager },
    });
  }
}

async function main() {
  console.log("Seeding MedRep V2 core data...");

  const permissionByCode = new Map<string, string>();

  for (const [code, name] of permissions) {
    const permission = await prisma.permission.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
    permissionByCode.set(code, permission.id);
  }

  const roleByCode = new Map<string, string>();

  for (const [code, permissionCodes] of Object.entries(roleDefinitions)) {
    const role = await prisma.role.upsert({
      where: { code },
      update: {
        name: roleNames[code as keyof typeof roleDefinitions],
        isSystem: true,
      },
      create: {
        code,
        name: roleNames[code as keyof typeof roleDefinitions],
        isSystem: true,
      },
    });

    roleByCode.set(code, role.id);

    for (const permissionCode of permissionCodes) {
      const permissionId = permissionByCode.get(permissionCode);
      if (!permissionId) throw new Error(`Unknown permission code: ${permissionCode}`);
      await ensureRolePermission(role.id, permissionId);
    }
  }

  const organization = await prisma.organization.upsert({
    where: { code: "DEMO_PHARMA" },
    update: { name: "شركة دوائية تجريبية", status: "ACTIVE" },
    create: { code: "DEMO_PHARMA", name: "شركة دوائية تجريبية", status: "ACTIVE" },
  });

  await prisma.organizationSettings.upsert({
    where: { organizationId: organization.id },
    update: {
      timezone: "Asia/Damascus",
      defaultDailyVisitTarget: 8,
      defaultAnnualLeaveDays: 12,
      defaultCycleDays: 45,
    },
    create: {
      organizationId: organization.id,
      timezone: "Asia/Damascus",
      defaultDailyVisitTarget: 8,
      defaultAnnualLeaveDays: 12,
      defaultCycleDays: 45,
    },
  });

  const workdayRules = [
    { weekday: 0, isWorking: true, workloadFactor: 1 },
    { weekday: 1, isWorking: true, workloadFactor: 1 },
    { weekday: 2, isWorking: true, workloadFactor: 1 },
    { weekday: 3, isWorking: true, workloadFactor: 1 },
    { weekday: 4, isWorking: true, workloadFactor: 0.5 },
    { weekday: 5, isWorking: false, workloadFactor: 0 },
    { weekday: 6, isWorking: true, workloadFactor: 1 },
  ];

  for (const rule of workdayRules) {
    await prisma.organizationWorkingDayRule.upsert({
      where: {
        organizationId_weekday: {
          organizationId: organization.id,
          weekday: rule.weekday,
        },
      },
      update: rule,
      create: { organizationId: organization.id, ...rule },
    });
  }

  const provinceByName = new Map<string, string>();

  for (const provinceName of provinces) {
    const province = await prisma.province.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name: provinceName,
        },
      },
      update: {},
      create: { organizationId: organization.id, name: provinceName },
    });
    provinceByName.set(provinceName, province.id);
  }

  const aleppoId = provinceByName.get("حلب");
  if (!aleppoId) throw new Error("Aleppo province was not created.");

  for (const areaName of aleppoAreas) {
    await prisma.area.upsert({
      where: {
        organizationId_provinceId_name: {
          organizationId: organization.id,
          provinceId: aleppoId,
          name: areaName,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        provinceId: aleppoId,
        name: areaName,
      },
    });
  }

  const targetClasses = [
    { code: "A", name: "Class A", rank: 1 },
    { code: "B", name: "Class B", rank: 2 },
    { code: "C", name: "Class C", rank: 3 },
  ];

  for (const item of targetClasses) {
    await prisma.targetClass.upsert({
      where: {
        organizationId_code: {
          organizationId: organization.id,
          code: item.code,
        },
      },
      update: { name: item.name, rank: item.rank, isActive: true },
      create: { organizationId: organization.id, ...item, isActive: true },
    });
  }

  for (const name of specialties) {
    await prisma.specialty.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name,
        },
      },
      update: {},
      create: { organizationId: organization.id, name },
    });
  }

  const team = await prisma.team.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: "فريق حلب",
      },
    },
    update: { provinceId: aleppoId, isActive: true },
    create: {
      organizationId: organization.id,
      provinceId: aleppoId,
      name: "فريق حلب",
      code: "ALEPPO-01",
      isActive: true,
    },
  });

  const aleppoAreaRows = await prisma.area.findMany({
    where: {
      organizationId: organization.id,
      provinceId: aleppoId,
      name: { in: aleppoAreas },
    },
  });

  for (const area of aleppoAreaRows) {
    await prisma.teamArea.upsert({
      where: { teamId_areaId: { teamId: team.id, areaId: area.id } },
      update: {},
      create: { teamId: team.id, areaId: area.id },
    });
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  const superAdmin = await prisma.user.upsert({
    where: { username: "superadmin" },
    update: {
      name: "Super Admin",
      passwordHash,
      status: "ACTIVE",
      organizationId: null,
    },
    create: {
      username: "superadmin",
      name: "Super Admin",
      passwordHash,
      status: "ACTIVE",
    },
  });

  const nationalManager = await prisma.user.upsert({
    where: { username: "national.manager" },
    update: {
      name: "المدير الوطني",
      organizationId: organization.id,
      passwordHash,
      status: "ACTIVE",
    },
    create: {
      username: "national.manager",
      name: "المدير الوطني",
      organizationId: organization.id,
      passwordHash,
      status: "ACTIVE",
    },
  });

  const teamManager = await prisma.user.upsert({
    where: { username: "team.manager" },
    update: {
      name: "مدير فريق حلب",
      organizationId: organization.id,
      passwordHash,
      status: "ACTIVE",
    },
    create: {
      username: "team.manager",
      name: "مدير فريق حلب",
      organizationId: organization.id,
      passwordHash,
      status: "ACTIVE",
    },
  });

  const rep = await prisma.user.upsert({
    where: { username: "rep.demo" },
    update: {
      name: "مندوب تجريبي",
      organizationId: organization.id,
      passwordHash,
      status: "ACTIVE",
    },
    create: {
      username: "rep.demo",
      name: "مندوب تجريبي",
      organizationId: organization.id,
      passwordHash,
      status: "ACTIVE",
    },
  });

  await assignRole(superAdmin.id, roleByCode.get("SUPER_ADMIN")!);
  await assignRole(nationalManager.id, roleByCode.get("NATIONAL_MANAGER")!);
  await assignRole(teamManager.id, roleByCode.get("TEAM_MANAGER")!);
  await assignRole(rep.id, roleByCode.get("REP")!);

  await ensureActiveTeamMember(team.id, teamManager.id, true);
  await ensureActiveTeamMember(team.id, rep.id, false);

  await prisma.repProfile.upsert({
    where: { userId: rep.id },
    update: {
      organizationId: organization.id,
      employeeCode: "REP-0001",
      dailyVisitTarget: 8,
    },
    create: {
      organizationId: organization.id,
      userId: rep.id,
      employeeCode: "REP-0001",
      dailyVisitTarget: 8,
    },
  });

  console.log("");
  console.log("Core seed completed successfully.");
  console.log(`Organization: ${organization.name}`);
  console.log("");
  console.log("Development users:");
  console.log("  superadmin");
  console.log("  national.manager");
  console.log("  team.manager");
  console.log("  rep.demo");
  console.log("");
  console.log(`Development password: ${DEFAULT_PASSWORD}`);
  console.log("Change/remove demo credentials before production.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
