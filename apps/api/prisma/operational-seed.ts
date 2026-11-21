import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set.");

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

const ORG_CODE = "DEMO_PHARMA";
const REP_USERNAME = "rep.demo";
const TEAM_NAME = "فريق حلب";
const CYCLE_NAME = "دورة سبتمبر–أكتوبر 2026";

const productNames = [
  "Rosuva",
  "Tensocard",
  "Lodiptan Plus",
  "Apixaban",
  "Digoxin",
  "Orlistat",
  "Ralvic Chrono",
  "Nadolol",
];

const doctors = [
  { name: "د. أحمد الخطيب", area: "الحمدانية", specialty: "القلبية", classCode: "A" },
  { name: "د. سامر حمادة", area: "الفرقان", specialty: "الداخلية", classCode: "A" },
  { name: "د. لينا الشامي", area: "الموكامبو", specialty: "الغدد والسكري", classCode: "A" },
  { name: "د. رامي حلاق", area: "حلب الجديدة", specialty: "العصبية", classCode: "A" },

  { name: "د. مروان درويش", area: "الجميلية", specialty: "القلبية", classCode: "B" },
  { name: "د. نور حداد", area: "الحمدانية", specialty: "الداخلية", classCode: "B" },
  { name: "د. يامن السيد", area: "الفرقان", specialty: "الغدد والسكري", classCode: "B" },
  { name: "د. هالة نجار", area: "الموكامبو", specialty: "النفسية", classCode: "B" },

  { name: "د. تيم عابدين", area: "حلب الجديدة", specialty: "الكلية", classCode: "C" },
  { name: "د. سارة صباغ", area: "الجميلية", specialty: "الأطفال", classCode: "C" },
  { name: "د. وائل المصري", area: "الحمدانية", specialty: "الهضمية", classCode: "C" },
  { name: "د. ريم خليل", area: "الفرقان", specialty: "المسالك البولية", classCode: "C" },
] as const;

const visitPlan: Record<string, string[]> = {
  "د. أحمد الخطيب": ["2026-09-05T09:30:00+03:00", "2026-09-22T10:00:00+03:00"],
  "د. سامر حمادة": ["2026-09-23T11:15:00+03:00"],
  "د. لينا الشامي": [],
  "د. رامي حلاق": ["2026-09-04T12:00:00+03:00", "2026-09-14T09:45:00+03:00", "2026-09-24T12:15:00+03:00"],

  "د. مروان درويش": ["2026-09-08T10:30:00+03:00", "2026-09-21T09:30:00+03:00"],
  "د. نور حداد": ["2026-09-24T14:00:00+03:00"],
  "د. يامن السيد": [],
  "د. هالة نجار": ["2026-09-10T11:00:00+03:00", "2026-09-23T15:00:00+03:00"],

  "د. تيم عابدين": ["2026-09-19T10:15:00+03:00"],
  "د. سارة صباغ": [],
  "د. وائل المصري": ["2026-09-22T13:30:00+03:00"],
  "د. ريم خليل": ["2026-09-25T09:15:00+03:00"],
};

function requiredVisitsForClass(code: string) {
  if (code === "A") return 3;
  if (code === "B") return 2;
  return 1;
}

async function ensureTeamPeriod(repCycleProfileId: string, teamId: string) {
  const existing = await prisma.repCycleTeamPeriod.findFirst({
    where: {
      repCycleProfileId,
      teamId,
      endedAt: null,
    },
  });

  if (!existing) {
    await prisma.repCycleTeamPeriod.create({
      data: {
        repCycleProfileId,
        teamId,
        startedAt: new Date("2026-09-01T00:00:00+03:00"),
      },
    });
  }
}

async function main() {
  console.log("Seeding operational demo data...");

  const organization = await prisma.organization.findUnique({
    where: { code: ORG_CODE },
  });
  if (!organization) throw new Error(`Organization ${ORG_CODE} not found. Run the core seed first.`);

  const rep = await prisma.user.findUnique({
    where: { username: REP_USERNAME },
  });
  if (!rep) throw new Error(`User ${REP_USERNAME} not found. Run the core seed first.`);

  const team = await prisma.team.findFirst({
    where: {
      organizationId: organization.id,
      name: TEAM_NAME,
      deletedAt: null,
    },
  });
  if (!team) throw new Error(`Team ${TEAM_NAME} not found.`);

  const cycle = await prisma.cycle.upsert({
    where: {
      organizationId_name: {
        organizationId: organization.id,
        name: CYCLE_NAME,
      },
    },
    update: {
      timezone: "Asia/Damascus",
      startsAt: new Date("2026-09-01T00:00:00+03:00"),
      endsAt: new Date("2026-10-15T00:00:00+03:00"),
      status: "ACTIVE",
    },
    create: {
      organizationId: organization.id,
      name: CYCLE_NAME,
      timezone: "Asia/Damascus",
      startsAt: new Date("2026-09-01T00:00:00+03:00"),
      endsAt: new Date("2026-10-15T00:00:00+03:00"),
      status: "ACTIVE",
    },
  });

  const classes = await prisma.targetClass.findMany({
    where: {
      organizationId: organization.id,
      code: { in: ["A", "B", "C"] },
      isActive: true,
    },
  });
  const classByCode = new Map(classes.map((c) => [c.code, c]));

  for (const code of ["A", "B", "C"]) {
    const targetClass = classByCode.get(code);
    if (!targetClass) throw new Error(`Target class ${code} not found.`);

    await prisma.cycleClassRule.upsert({
      where: {
        cycleId_targetClassId: {
          cycleId: cycle.id,
          targetClassId: targetClass.id,
        },
      },
      update: { requiredVisits: requiredVisitsForClass(code) },
      create: {
        cycleId: cycle.id,
        targetClassId: targetClass.id,
        requiredVisits: requiredVisitsForClass(code),
      },
    });
  }

  const orgWorkingDays = await prisma.organizationWorkingDayRule.findMany({
    where: { organizationId: organization.id },
  });

  for (const rule of orgWorkingDays) {
    await prisma.cycleWorkingDayRule.upsert({
      where: {
        cycleId_weekday: {
          cycleId: cycle.id,
          weekday: rule.weekday,
        },
      },
      update: {
        isWorking: rule.isWorking,
        workloadFactor: rule.workloadFactor,
        startTime: rule.startTime,
        endTime: rule.endTime,
      },
      create: {
        cycleId: cycle.id,
        weekday: rule.weekday,
        isWorking: rule.isWorking,
        workloadFactor: rule.workloadFactor,
        startTime: rule.startTime,
        endTime: rule.endTime,
      },
    });
  }

  const repCycle = await prisma.repCycleProfile.upsert({
    where: {
      cycleId_repId: {
        cycleId: cycle.id,
        repId: rep.id,
      },
    },
    update: {
      organizationId: organization.id,
      dailyVisitTarget: 8,
      isActive: true,
    },
    create: {
      organizationId: organization.id,
      cycleId: cycle.id,
      repId: rep.id,
      dailyVisitTarget: 8,
      isActive: true,
    },
  });

  await ensureTeamPeriod(repCycle.id, team.id);

  const areas = await prisma.area.findMany({
    where: {
      organizationId: organization.id,
      provinceId: team.provinceId ?? undefined,
      deletedAt: null,
    },
  });
  const areaByName = new Map(areas.map((a) => [a.name, a]));

  for (const area of areas) {
    await prisma.repCycleArea.upsert({
      where: {
        repCycleProfileId_areaId: {
          repCycleProfileId: repCycle.id,
          areaId: area.id,
        },
      },
      update: {},
      create: {
        repCycleProfileId: repCycle.id,
        areaId: area.id,
      },
    });
  }

  const products = [];
  for (const name of productNames) {
    const product = await prisma.product.upsert({
      where: {
        organizationId_name: {
          organizationId: organization.id,
          name,
        },
      },
      update: { isActive: true },
      create: {
        organizationId: organization.id,
        name,
        brandName: name,
        isActive: true,
      },
    });
    products.push(product);

    await prisma.repCycleProduct.upsert({
      where: {
        repCycleProfileId_productId: {
          repCycleProfileId: repCycle.id,
          productId: product.id,
        },
      },
      update: {},
      create: {
        repCycleProfileId: repCycle.id,
        productId: product.id,
      },
    });
  }

  const specialtyRows = await prisma.specialty.findMany({
    where: { organizationId: organization.id, deletedAt: null },
  });
  const specialtyByName = new Map(specialtyRows.map((s) => [s.name, s]));

  const targetByName = new Map<string, any>();

  for (const doctor of doctors) {
    const area = areaByName.get(doctor.area);
    if (!area) throw new Error(`Area ${doctor.area} not found.`);

    const specialty = specialtyByName.get(doctor.specialty);
    if (!specialty) throw new Error(`Specialty ${doctor.specialty} not found.`);

    const targetClass = classByCode.get(doctor.classCode);
    if (!targetClass) throw new Error(`Class ${doctor.classCode} not found.`);

    let target = await prisma.fieldTarget.findFirst({
      where: {
        organizationId: organization.id,
        type: "DOCTOR",
        name: doctor.name,
        deletedAt: null,
      },
    });

    if (!target) {
      target = await prisma.fieldTarget.create({
        data: {
          organizationId: organization.id,
          createdById: rep.id,
          type: "DOCTOR",
          name: doctor.name,
          isActive: true,
        },
      });
    }

    targetByName.set(doctor.name, target);

    await prisma.doctorProfile.upsert({
      where: { targetId: target.id },
      update: {},
      create: { targetId: target.id },
    });

    const currentPrimaryLocation = await prisma.targetLocation.findFirst({
      where: {
        targetId: target.id,
        areaId: area.id,
        isPrimary: true,
      },
    });

    if (!currentPrimaryLocation) {
      await prisma.targetLocation.create({
        data: {
          targetId: target.id,
          areaId: area.id,
          label: "العيادة الرئيسية",
          address: `${doctor.area} - حلب`,
          isPrimary: true,
        },
      });
    }

    await prisma.targetSpecialty.upsert({
      where: {
        targetId_specialtyId: {
          targetId: target.id,
          specialtyId: specialty.id,
        },
      },
      update: {},
      create: {
        targetId: target.id,
        specialtyId: specialty.id,
      },
    });

    await prisma.repCycleSpecialty.upsert({
      where: {
        repCycleProfileId_specialtyId: {
          repCycleProfileId: repCycle.id,
          specialtyId: specialty.id,
        },
      },
      update: {},
      create: {
        repCycleProfileId: repCycle.id,
        specialtyId: specialty.id,
      },
    });

    await prisma.repCycleTarget.upsert({
      where: {
        repCycleProfileId_targetId: {
          repCycleProfileId: repCycle.id,
          targetId: target.id,
        },
      },
      update: {
        targetClassId: targetClass.id,
        requiredVisits: requiredVisitsForClass(doctor.classCode),
      },
      create: {
        repCycleProfileId: repCycle.id,
        targetId: target.id,
        targetClassId: targetClass.id,
        requiredVisits: requiredVisitsForClass(doctor.classCode),
      },
    });
  }

  const roundRefs = new Map<string, string>();

  for (const [doctorName, dates] of Object.entries(visitPlan)) {
    const target = targetByName.get(doctorName);
    if (!target) throw new Error(`Target ${doctorName} not found.`);

    for (let index = 0; index < dates.length; index++) {
      const completedAt = new Date(dates[index]);
      const dayKey = completedAt.toISOString().slice(0, 10);
      const roundClientRef = `demo-round-${dayKey}`;

      let round = await prisma.fieldRound.findUnique({
        where: { clientRef: roundClientRef },
      });

      if (!round) {
        round = await prisma.fieldRound.create({
          data: {
            organizationId: organization.id,
            cycleId: cycle.id,
            repId: rep.id,
            repCycleProfileId: repCycle.id,
            clientRef: roundClientRef,
            status: "COMPLETED",
            startedAt: new Date(completedAt.getTime() - 2 * 60 * 60 * 1000),
            endedAt: new Date(completedAt.getTime() + 30 * 60 * 1000),
            notes: "جولة تجريبية",
          },
        });
      }

      roundRefs.set(dayKey, round.id);

      const clientRef = `demo-visit-${target.id}-${index + 1}`;

      await prisma.visit.upsert({
        where: { clientRef },
        update: {
          organizationId: organization.id,
          cycleId: cycle.id,
          repId: rep.id,
          repCycleProfileId: repCycle.id,
          targetId: target.id,
          roundId: round.id,
          status: "COMPLETED",
          startedAt: new Date(completedAt.getTime() - 20 * 60 * 1000),
          completedAt,
          notes: "زيارة تجريبية",
        },
        create: {
          organizationId: organization.id,
          cycleId: cycle.id,
          repId: rep.id,
          repCycleProfileId: repCycle.id,
          targetId: target.id,
          roundId: round.id,
          clientRef,
          status: "COMPLETED",
          startedAt: new Date(completedAt.getTime() - 20 * 60 * 1000),
          completedAt,
          notes: "زيارة تجريبية",
        },
      });
    }
  }

  const existingActiveRounds = await prisma.fieldRound.findMany({
    where: {
      repId: rep.id,
      status: "ACTIVE",
    },
    select: { id: true },
  });

  if (existingActiveRounds.length === 0) {
    await prisma.fieldRound.create({
      data: {
        organizationId: organization.id,
        cycleId: cycle.id,
        repId: rep.id,
        repCycleProfileId: repCycle.id,
        clientRef: "demo-active-round",
        status: "ACTIVE",
        startedAt: new Date("2026-09-25T13:30:00+03:00"),
        notes: "جولة حالية تجريبية",
      },
    });
  }

  console.log("");
  console.log("Operational demo seed completed.");
  console.log(`Cycle: ${cycle.name}`);
  console.log(`Representative: ${rep.name}`);
  console.log(`Doctors assigned: ${doctors.length}`);
  console.log(`Products assigned: ${products.length}`);
  console.log("Expected demo coverage: about 58.3%");
  console.log("");
  console.log("Now call GET /api/v1/rep/dashboard with a fresh access token.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
