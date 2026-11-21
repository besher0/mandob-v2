import { hasCompanyAccess } from '../company/company-access.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { validateSync, isUUID } from 'class-validator';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { dateInZone } from '../rep/rep-workspace.service.js';
import { ManagedTargetDto, DeleteTargetsDto } from './target-management.dto.js';
@Injectable()
export class TargetManagementService {
  constructor(private readonly prisma: PrismaService) {}
  private async scope(
    db: Prisma.TransactionClient,
    user: AuthUser,
    write = false,
    permission = write ? 'targets.manage' : 'targets.view',
  ) {
    if (
      !user.organizationId ||
      !user.permissions.includes(permission)
    )
      throw new ForbiddenException('ليست لديك صلاحية إدارة الجهات.');
    if(await hasCompanyAccess(db,user,permission)){
      const [provinces,specialties]=await Promise.all([
        db.province.findMany({where:{organizationId:user.organizationId,deletedAt:null},select:{id:true}}),
        db.specialty.findMany({where:{organizationId:user.organizationId,deletedAt:null},select:{id:true}}),
      ]);
      return {provinceIds:provinces.map(p=>p.id),specialtyIds:specialties.map(s=>s.id)};
    }
    if (user.roles.some(role => ['NATIONAL_MANAGER','COMPANY_STAFF'].includes(role))) throw new ForbiddenException('صلاحيات إدارة الشركة غير متاحة.');
    const now = new Date();
    const teams = await db.team.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        deletedAt: null,
        members: {
          some: {
            userId: user.id,
            isManager: true,
            startedAt: { lte: now },
            OR: [{ endedAt: null }, { endedAt: { gt: now } }],
          },
        },
      },
      select: {
        provinceId: true,
        specialties: { select: { specialtyId: true } },
      },
    });
    return {
      provinceIds: [
        ...new Set(teams.flatMap((t) => (t.provinceId ? [t.provinceId] : []))),
      ],
      specialtyIds: [
        ...new Set(
          teams.flatMap((t) => t.specialties.map((s) => s.specialtyId)),
        ),
      ],
    };
  }
  private narrowProvince(scope: {provinceIds:string[]}, provinceId?:string) {
    if (!provinceId) return;
    if (!isUUID(provinceId) || !scope.provinceIds.includes(provinceId)) throw new ForbiddenException('المحافظة خارج نطاقك.');
    scope.provinceIds = [provinceId];
  }
  async options(user: AuthUser, provinceId?:string) {
    const scope = await this.scope(this.prisma, user);
    this.narrowProvince(scope,provinceId);
    const [areas, classes, specialties] = await Promise.all([
      this.prisma.area.findMany({
        where: {
          organizationId: user.organizationId!,
          provinceId: { in: scope.provinceIds },
          deletedAt: null,
        },
        select: { id: true, name: true, province: { select: { name: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.targetClass.findMany({
        where: { organizationId: user.organizationId!, isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { rank: 'asc' },
      }),
      this.prisma.specialty.findMany({
        where: {
          organizationId: user.organizationId!,
          deletedAt: null,
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { areas, classes, specialties };
  }
  async list(user: AuthUser, type: string, provinceId?:string) {
    if (!['DOCTOR', 'PHARMACY', 'HOSPITAL'].includes(type))
      throw new BadRequestException('نوع الجهة غير صالح.');
    const scope = await this.scope(this.prisma, user);
    this.narrowProvince(scope,provinceId);
    const items = await this.prisma.fieldTarget.findMany({
      where: {
        organizationId: user.organizationId!,
        type: type as ManagedTargetDto['type'],
        deletedAt: null,
        isActive: true,
        locations: {
          some: {
            area: {
              provinceId: { in: scope.provinceIds },
              organizationId: user.organizationId!,
              deletedAt: null,
            },
          },
        },
      },
      include: {
        targetClass: { select: { id: true, code: true } },
        locations: {
          where: {
            area: {
              organizationId: user.organizationId!,
              provinceId: { in: scope.provinceIds },
              deletedAt: null,
            },
          },
          include: { area: { select: { id: true, name: true } } },
        },
        specialties: {
          include: { specialty: { select: { id: true, name: true } } },
        },
        doctorProfile: true,
        pharmacyProfile: true,
        hospitalProfile: true,
        _count: { select: { visits: true } },
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 1001,
    });
    return {
      items: items.slice(0, 1000).map((t) => ({
        id: t.id,
        type: t.type,
        name: t.name,
        phone: t.phone,
        areaId:
          t.locations.find((l) => l.isPrimary)?.areaId ??
          t.locations[0]?.areaId,
        areas: t.locations.map((l) => l.area),
        address:
          t.locations.find((l) => l.isPrimary)?.address ??
          t.locations[0]?.address,
        targetClassId: t.targetClassId,
        classCode: t.targetClass?.code ?? 'غير مصنف',
        specialtyId: t.specialties[0]?.specialtyId,
        specialties: t.specialties.map((s) => s.specialty.name),
        notes:
          t.doctorProfile?.notes ??
          t.pharmacyProfile?.notes ??
          t.hospitalProfile?.notes ??
          '',
        affiliation: t.pharmacyProfile?.affiliation,
        kind: t.hospitalProfile?.kind,
        hasVisits: t._count.visits > 0,
      })),
      canDelete: user.permissions.includes('targets.delete'),
      truncated: items.length > 1000,
      needsSpecialties: false,
    };
  }
  private async write(
    db: Prisma.TransactionClient,
    user: AuthUser,
    dto: ManagedTargetDto,
    id?: string,
    provinceId?: string,
  ) {
    const scope = await this.scope(db, user, true);
    this.narrowProvince(scope,provinceId);
    const area = await db.area.findFirst({
      where: {
        id: dto.areaId,
        organizationId: user.organizationId!,
        provinceId: { in: scope.provinceIds },
        deletedAt: null,
      },
    });
    const cls = await db.targetClass.findFirst({
      where: {
        id: dto.targetClassId,
        organizationId: user.organizationId!,
        isActive: true,
      },
    });
    if (!area || !cls)
      throw new ForbiddenException('المنطقة أو التصنيف خارج نطاقك.');
    if (
      dto.type === 'DOCTOR' &&
      (!dto.specialtyId ||
        !(await db.specialty.findFirst({
          where: {
            id: dto.specialtyId,
            organizationId: user.organizationId!,
            deletedAt: null,
          },
        })))
    )
      throw new ForbiddenException('الاختصاص غير متاح.');
    if (!dto.name.trim()) throw new BadRequestException('اسم الجهة مطلوب.');
    let old = null;
    if (id) {
      old = await db.fieldTarget.findFirst({
        where: {
          id,
          organizationId: user.organizationId!,
          type: dto.type,
          deletedAt: null,
          locations: {
            some: { area: { provinceId: { in: scope.provinceIds } } },
          },
        },
        include: {
          locations: true,
          specialties: true,
          _count: { select: { visits: true, repAssignments: true } },
        },
      });
      if (!old) throw new ForbiddenException('الجهة خارج نطاقك.');
      if (old.locations.length > 1 || old.specialties.length > 1)
        throw new ConflictException(
          'للجهة عدة مواقع أو اختصاصات؛ يلزم تعديلها من إدارة البيانات المتعددة.',
        );
      if (
        (old._count.visits || old._count.repAssignments) &&
        (!old.locations.some((l) => l.areaId === dto.areaId) ||
          (dto.type === 'DOCTOR' &&
            !old.specialties.some((s) => s.specialtyId === dto.specialtyId)))
      )
        throw new ConflictException(
          'الجهة مستخدمة في تكليفات أو زيارات؛ لا يمكن تغيير منطقتها أو اختصاصها بأثر رجعي.',
        );
    }
    if (
      !id &&
      (await db.fieldTarget.findFirst({
        where: {
          organizationId: user.organizationId!,
          type: dto.type,
          name: dto.name.trim(),
          deletedAt: null,
          locations: { some: { areaId: dto.areaId } },
          ...(dto.specialtyId
            ? { specialties: { some: { specialtyId: dto.specialtyId } } }
            : {}),
        },
      }))
    )
      throw new ConflictException(
        'يوجد سجل بنفس الاسم والمنطقة. عدّله بمعرّفه بدلاً من إنشاء مكرر.',
      );
    const scalar = {
      name: dto.name.trim(),
      targetClassId: cls.id,
      ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
    };
    const target = id
      ? await db.fieldTarget.update({ where: { id }, data: scalar })
      : await db.fieldTarget.create({
          data: {
            ...scalar,
            type: dto.type,
            organizationId: user.organizationId!,
            createdById: user.id,
          },
        });
    if (old?.locations[0])
      await db.targetLocation.update({
        where: { id: old.locations[0].id },
        data: {
          areaId: area.id,
          ...(dto.address !== undefined
            ? { address: dto.address.trim() || null }
            : {}),
        },
      });
    else
      await db.targetLocation.create({
        data: {
          targetId: target.id,
          areaId: area.id,
          address: dto.address?.trim() || null,
          isPrimary: true,
        },
      });
    if (dto.type === 'DOCTOR') {
      if (!old?.specialties.some((s) => s.specialtyId === dto.specialtyId)) {
        await db.targetSpecialty.deleteMany({ where: { targetId: target.id } });
        await db.targetSpecialty.create({
          data: { targetId: target.id, specialtyId: dto.specialtyId! },
        });
      }
      await db.doctorProfile.upsert({
        where: { targetId: target.id },
        create: { targetId: target.id, notes: dto.notes },
        update: dto.notes !== undefined ? { notes: dto.notes || null } : {},
      });
    }
    if (dto.type === 'PHARMACY')
      await db.pharmacyProfile.upsert({
        where: { targetId: target.id },
        create: {
          targetId: target.id,
          notes: dto.notes,
          affiliation: dto.affiliation,
        },
        update: {
          ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
          ...(dto.affiliation !== undefined
            ? { affiliation: dto.affiliation }
            : {}),
        },
      });
    if (dto.type === 'HOSPITAL')
      await db.hospitalProfile.upsert({
        where: { targetId: target.id },
        create: { targetId: target.id, notes: dto.notes, kind: dto.kind },
        update: {
          ...(dto.notes !== undefined ? { notes: dto.notes || null } : {}),
          kind: dto.kind ?? null,
        },
      });
    // New catalog records must be available to existing matching assignments too.
    if (!id) {
      const periods = await db.repCycleTeamPeriod.findMany({
        where: {
          scopeConfigured: true,
          team: {
            organizationId: user.organizationId!,
            isActive: true,
            deletedAt: null,
          },
          repCycleProfile: {
            organizationId: user.organizationId!,
            isActive: true,
            cycle: { status: 'ACTIVE' },
          },
          scopeAreas: { some: { areaId: area.id } },
          ...(dto.type === 'DOCTOR'
            ? { scopeSpecialties: { some: { specialtyId: dto.specialtyId! } } }
            : {}),
        },
        include: {
          team: { select: { provinceId: true } },
          repCycleProfile: {
            include: {
              cycle: {
                include: { classRules: true, provinceClassRules: true },
              },
            },
          },
        },
      });
      for (const period of periods) {
        const cycle = period.repCycleProfile.cycle;
        const today = new Date(
          dateInZone(new Date(), cycle.timezone) + 'T00:00:00Z',
        );
        if (
          cycle.startsAt > today ||
          cycle.endsAt < today ||
          period.startedAt > today ||
          (period.endedAt && period.endedAt < today)
        )
          continue;
        const rule =
          cycle.provinceClassRules.find(
            (r) =>
              r.provinceId === period.team.provinceId &&
              r.targetClassId === cls.id,
          ) ?? cycle.classRules.find((r) => r.targetClassId === cls.id);
        if (!rule)
          throw new BadRequestException(
            'لا توجد قاعدة زيارات لهذا التصنيف في السايكل؛ لم تُحفظ الجهة.',
          );
        const assignment = await db.repCycleTarget.upsert({
          where: {
            repCycleProfileId_targetId: {
              repCycleProfileId: period.repCycleProfileId,
              targetId: target.id,
            },
          },
          create: {
            repCycleProfileId: period.repCycleProfileId,
            targetId: target.id,
            targetClassId: cls.id,
            requiredVisits: rule.requiredVisits,
          },
          update: {},
        });
        await db.teamScopeTarget.upsert({
          where: {
            teamPeriodId_repCycleTargetId: {
              teamPeriodId: period.id,
              repCycleTargetId: assignment.id,
            },
          },
          create: {
            teamPeriodId: period.id,
            repCycleTargetId: assignment.id,
            requiredVisits: rule.requiredVisits,
          },
          update: {},
        });
      }
    }
    await db.auditLog.create({
      data: {
        organizationId: user.organizationId!,
        actorId: user.id,
        action: id ? 'UPDATE' : 'CREATE',
        entityType: 'FieldTarget',
        entityId: target.id,
        afterData: {
          ...scalar,
          type: dto.type,
          areaId: area.id,
          specialtyId: dto.specialtyId ?? null,
        },
      },
    });
    return { id: target.id };
  }
  private async transaction<T>(
    fn: (db: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 30000,
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2034'
      )
        throw new ConflictException('تعديل متزامن؛ أعد المحاولة.');
      throw e;
    }
  }
  save(user: AuthUser, dto: ManagedTargetDto, id?: string, provinceId?:string) {
    return this.transaction((db) => this.write(db, user, dto, id,provinceId));
  }
  deleteMany(user: AuthUser, dto: DeleteTargetsDto, provinceId?:string) {
    return this.transaction(async db => {
      const scope = await this.scope(db, user, false, 'targets.delete');
      this.narrowProvince(scope,provinceId);
      const ids = [...new Set(dto.ids)];
      if (!ids.length || ids.length > 1000 || ids.length !== dto.ids.length)
        throw new BadRequestException('حدد بين جهة واحدة و1000 جهة دون تكرار.');
      const targets = await db.fieldTarget.findMany({
        where: {
          id: { in: ids }, organizationId: user.organizationId!, type: dto.type,
          deletedAt: null, isActive: true,
          // Deleting a shared multi-location target requires scope over every location.
          locations: {
            some: { area: { organizationId: user.organizationId!, deletedAt: null, provinceId: { in: scope.provinceIds } } },
            every: { area: { organizationId: user.organizationId!, provinceId: { in: scope.provinceIds } } },
          },
        }, select: { id: true, name: true },
      });
      if (targets.length !== ids.length)
        throw new ConflictException('تغيرت بعض الجهات أو أصبحت خارج نطاقك؛ حدّث الجدول. لم تُحذف أي جهة.');
      const deletedAt = new Date();
      await db.fieldTarget.updateMany({ where: { id: { in: ids }, organizationId: user.organizationId! }, data: { deletedAt, isActive: false } });
      await db.auditLog.createMany({ data: targets.map(target => ({
        organizationId: user.organizationId!, actorId: user.id, action: 'DELETE' as const,
        entityType: 'FieldTarget', entityId: target.id,
        beforeData: { name: target.name, type: dto.type, isActive: true },
        afterData: { deletedAt: deletedAt.toISOString(), isActive: false },
      })) });
      return { deleted: targets.length };
    });
  }
  // Reject oversized expansion before handing a ZIP workbook to the parser.
  private checkArchive(buffer: Buffer) {
    let end = -1;
    for (
      let i = buffer.length - 22;
      i >= Math.max(0, buffer.length - 65557);
      i--
    ) {
      if (buffer.readUInt32LE(i) === 0x06054b50) {
        end = i;
        break;
      }
    }
    if (end < 0) throw new BadRequestException('اختر ملف Excel بصيغة .xlsx.');
    const count = buffer.readUInt16LE(end + 10);
    let offset = buffer.readUInt32LE(end + 16),
      size = 0;
    if (count > 2000) throw new BadRequestException('الملف كبير جداً.');
    for (let i = 0; i < count; i++) {
      if (
        offset + 46 > buffer.length ||
        buffer.readUInt32LE(offset) !== 0x02014b50
      )
        throw new BadRequestException('ملف Excel غير صالح.');
      size += buffer.readUInt32LE(offset + 24);
      if (size > 20 * 1024 * 1024)
        throw new BadRequestException('محتوى الملف أكبر من المسموح.');
      offset +=
        46 +
        buffer.readUInt16LE(offset + 28) +
        buffer.readUInt16LE(offset + 30) +
        buffer.readUInt16LE(offset + 32);
    }
  }
  async exportDoctors(user: AuthUser, template = false, search = '', areaId = '', provinceId?:string, specialtyOrder?:string) {
    const options = await this.options(user,provinceId);
    const catalog = template ? null : await this.list(user, 'DOCTOR',provinceId);
    if (catalog?.truncated)
      throw new BadRequestException('التصدير يتجاوز نطاق القائمة المتاح؛ يلزم تقسيم البيانات قبل التصدير.');
    const items = (catalog?.items ?? []).filter(t =>
      (!areaId || t.areas.some(a => a.id === areaId)) &&
      `${t.name} ${t.specialties.join(' ')}`.includes(search.trim()));
    if (specialtyOrder !== undefined) {
      let ids: unknown;
      try { ids = JSON.parse(specialtyOrder); } catch { throw new BadRequestException('فلتر الاختصاصات غير صالح.'); }
      if (!Array.isArray(ids) || ids.length > 1000 || !ids.every(id => typeof id === 'string' && (id === '' || isUUID(id))))
        throw new BadRequestException('فلتر الاختصاصات غير صالح.');
      const order = ids as string[];
      const filtered = items.filter(t => order.includes(t.specialtyId ?? ''));
      filtered.sort((a, b) => order.indexOf(a.specialtyId ?? '') - order.indexOf(b.specialtyId ?? ''));
      items.splice(0, items.length, ...filtered);
    }
    if (items.length > 500)
      throw new BadRequestException('حدد البحث أو المنطقة لتصدير 500 طبيب كحد أقصى في الملف.');
    if (items.some(t => t.areas.length !== 1 || t.specialties.length !== 1))
      throw new BadRequestException('توجد جهات متعددة المواقع أو الاختصاصات؛ تحتاج معالجة منفصلة قبل تصدير ملف قابل لإعادة الاستيراد.');
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Doctors', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
    sheet.addRow(['id', 'Name', 'areaId', 'المنطقة للقراءة', 'specialtyId', 'الاختصاص للقراءة', 'targetClassId', 'التصنيف للقراءة', 'phone', 'address', 'notes']);
    for (const t of items) sheet.addRow([t.id, t.name, t.areaId ?? '', t.areas[0]?.name ?? '', t.specialtyId ?? '', t.specialties.join('، '), t.targetClassId ?? '', t.classCode, t.phone ?? '', t.address ?? '', t.notes]);
    const areas = book.addWorksheet('Areas');
    areas.addRow(['areaId', 'المنطقة', 'المحافظة']);
    options.areas.forEach(a => areas.addRow([a.id, a.name, a.province.name]));
    const specialties = book.addWorksheet('Specialties');
    specialties.addRow(['specialtyId', 'الاختصاص']);
    options.specialties.forEach(a => specialties.addRow([a.id, a.name]));
    const classes = book.addWorksheet('Classes');
    classes.addRow(['targetClassId', 'التصنيف']);
    options.classes.forEach(a => classes.addRow([a.id, a.code]));
    const instructions = book.addWorksheet('تعليمات');
    [
      'عدّل ورقة Doctors فقط. الحد الأقصى 500 طبيب و5 MB.',
      'لتحديث طبيب احتفظ بعمود id. لإضافة طبيب جديد اترك id فارغاً.',
      'يدعم الاستيراد أسماء المناطق والاختصاصات أو معرّفاتها. الاسم الجديد يُضاف تلقائياً إذا كانت لديك صلاحية إنشائه.',
      'الملف البسيط: Name، Specailist، Doctor geo name، Classification، City. المحافظة مطلوبة للمنطقة الجديدة عند وجود أكثر من محافظة في نطاقك.',
      'في هذا القالب استخدم معرّفات الأوراق المرفقة؛ أعمدة الأسماء للقراءة فقط.',
      'حذف صف من الملف لا يحذف الطبيب من النظام. جميع الصفوف تُحفظ معاً أو يُرفض الملف بالكامل.',
      'لا تستخدم معادلات. تحفظ الهواتف كنص للحفاظ على الأصفار.',
      'لا يمكن تغيير منطقة أو اختصاص طبيب مرتبط بتكليفات أو زيارات من هذا الملف.',
    ].forEach(line => instructions.addRow([line]));
    for (const ws of book.worksheets) {
      ws.getRow(1).font = { bold: true };
      ws.columns.forEach(c => { c.width = ws === instructions ? 110 : 38; c.numFmt = '@'; });
    }
    sheet.autoFilter = { from: 'A1', to: 'K1' };
    return Buffer.from(await book.xlsx.writeBuffer());
  }
  async importDoctors(
    user: AuthUser,
    file?: { buffer: Buffer; originalname: string },
    provinceId?: string,
  ) {
    await this.scope(this.prisma, user, true);
    if (!file?.buffer.length || file.buffer.length > 5 * 1024 * 1024)
      throw new BadRequestException('اختر ملفاً حتى 5 MB.');
    this.checkArchive(file.buffer);
    const book = new ExcelJS.Workbook();
    try {
      await book.xlsx.load(
        file.buffer as unknown as Parameters<typeof book.xlsx.load>[0],
      );
    } catch {
      throw new BadRequestException('تعذر قراءة ملف Excel.');
    }
    const sheet = book.worksheets[0];
    if (
      !sheet ||
      sheet.rowCount < 2 ||
      sheet.rowCount > 501 ||
      sheet.columnCount > 30
    )
      throw new BadRequestException(
        'يجب أن يحتوي الملف على 1 إلى 500 صف و30 عموداً كحد أقصى.',
      );
    const headers = new Map<string, number>();
    sheet
      .getRow(1)
      .eachCell((c, i) => headers.set(c.text.trim().toLowerCase(), i));
    const get = (row: number, aliases: string[]) => {
      const col = aliases
        .map((x) => headers.get(x.toLowerCase()))
        .find(Boolean);
      if (!col) return '';
      const cell = sheet.getRow(row).getCell(col);
      if (cell.type === ExcelJS.ValueType.Formula)
        throw new BadRequestException(
          `الصف ${row}: استخدم قيماً مباشرة بدلاً من المعادلات.`,
        );
      return cell.text.trim();
    };
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    return this.transaction(async (db) => {
      const scope = await this.scope(db,user,true);
      this.narrowProvince(scope,provinceId);
      const prior = await db.auditLog.findFirst({where:{organizationId:user.organizationId!,actorId:user.id,entityType:'DoctorImport',afterData:{path:['hash'],equals:hash}}});
      if (prior) return { imported: 0, updated: 0, replayed: true };
      const provinces = await db.province.findMany({where:{organizationId:user.organizationId!,id:{in:scope.provinceIds},deletedAt:null},select:{id:true,name:true}});
      const options = {
        areas: await db.area.findMany({where:{organizationId:user.organizationId!,provinceId:{in:scope.provinceIds},deletedAt:null},select:{id:true,name:true,provinceId:true}}),
        specialties: await db.specialty.findMany({where:{organizationId:user.organizationId!,deletedAt:null},select:{id:true,name:true}}),
        classes: await db.targetClass.findMany({where:{organizationId:user.organizationId!,isActive:true},select:{id:true,code:true}}),
      };
      // Orthographic normalization only; medical synonyms are never guessed.
      const normal = (value:string) => value.normalize('NFKC').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/\s+/g,' ').trim().replace(/^ال/,'').toLowerCase();
      const find = <T extends {id:string;name:string}>(list:T[],value:string,row:number,label:string):T|undefined => {
        const exact = list.filter(x=>x.id===value||x.name===value);
        const matches = exact.length ? exact : list.filter(x=>normal(x.name)===normal(value));
        if(matches.length>1) throw new BadRequestException(`الصف ${row}: ${label} ملتبس «${value}»؛ استخدم المعرّف لتحديد السجل.`);
        return matches[0];
      };
      const resolve = (list:{id:string;name:string}[],value:string,row:number,label:string) => {
        const found=find(list,value,row,label);
        if(!found) throw new BadRequestException(`الصف ${row}: ${label} غير معروف: ${value}`);
        return found.id;
      };
      const rows: { dto: ManagedTargetDto; id?: string; row: number }[] = [];
    for (let row = 2; row <= sheet.rowCount; row++) {
      if (!sheet.getRow(row).hasValues) continue;
      const dto = new ManagedTargetDto();
      dto.type = 'DOCTOR';
      dto.name = get(row, ['Name', 'اسم الطبيب']);
      const city = get(row, ['City', 'المحافظة']);
      const areaValue = get(row, ['areaId', 'Doctor geo name', 'المنطقة']);
      const specialtyValue = get(row, ['specialtyId', 'Specailist', 'Specialist', 'الاختصاص']);
      for (const column of ['areaId','specialtyId']) { const value=get(row,[column]); if(value&&!isUUID(value)) throw new BadRequestException(`الصف ${row}: ${column} يجب أن يكون UUID صالحاً؛ استخدم عمود الاسم عند عدم وجود معرّف.`); }
      const provinceMatches = city ? provinces.filter(p => normal(p.name) === normal(city)) : provinces;
      if (city && provinceMatches.length !== 1) throw new BadRequestException(`الصف ${row}: المحافظة غير معروفة أو خارج نطاقك: ${city}`);
      const areaOptions = options.areas.filter(a => !city || provinceMatches.some(p => p.id === a.provinceId));
      let area = find(areaOptions, areaValue, row, 'المنطقة');
      if (!area) {
        if (!areaValue || isUUID(areaValue) || areaValue.length > 120) throw new BadRequestException(`الصف ${row}: اسم المنطقة أو معرّفها غير صالح.`);
        if (provinceMatches.length !== 1) throw new BadRequestException(`الصف ${row}: أضف عمود City (المحافظة) لتحديد مكان المنطقة الجديدة «${areaValue}».`);
        if (!user.permissions.includes('areas.manage_own') && !await hasCompanyAccess(db,user,'areas.manage')) throw new ForbiddenException(`الصف ${row}: إنشاء المنطقة «${areaValue}» يحتاج صلاحية إدارة المناطق.`);
        area = await db.area.create({data:{organizationId:user.organizationId!,provinceId:provinceMatches[0].id,name:areaValue},select:{id:true,name:true,provinceId:true}});
        options.areas.push(area);
        await db.auditLog.create({data:{organizationId:user.organizationId!,actorId:user.id,action:'CREATE',entityType:'Area',entityId:area.id,afterData:{name:area.name,provinceId:area.provinceId,source:'DoctorImport'}}});
      }
      dto.areaId = area.id;
      let specialty = find(options.specialties,specialtyValue,row,'الاختصاص');
      if (!specialty) {
        if (!specialtyValue || isUUID(specialtyValue) || specialtyValue.length > 120) throw new BadRequestException(`الصف ${row}: اسم الاختصاص أو معرّفه غير صالح.`);
        if (!await hasCompanyAccess(db,user,'specialties.manage')) throw new ForbiddenException(`الصف ${row}: إنشاء الاختصاص «${specialtyValue}» يحتاج صلاحية إدارة الاختصاصات.`);
        specialty = await db.specialty.create({data:{organizationId:user.organizationId!,name:specialtyValue},select:{id:true,name:true}});
        options.specialties.push(specialty);
        await db.auditLog.create({data:{organizationId:user.organizationId!,actorId:user.id,action:'CREATE',entityType:'Specialty',entityId:specialty.id,afterData:{name:specialty.name,source:'DoctorImport'}}});
      }
      dto.specialtyId = specialty.id;
      dto.targetClassId = resolve(
        options.classes.map((c) => ({ id: c.id, name: c.code })),
        get(row, ['targetClassId', 'classification', 'التصنيف'])
          .toUpperCase()
          .replace(/[A-F0-9-]{36}/g, (m) => m.toLowerCase()),
        row,
        'التصنيف',
      );
      if (['phone', 'الهاتف'].some((h) => headers.has(h)))
        dto.phone = get(row, ['phone', 'الهاتف']);
      if (['address', 'العنوان'].some((h) => headers.has(h)))
        dto.address = get(row, ['address', 'العنوان']);
      if (['notes', 'الملاحظة'].some((h) => headers.has(h)))
        dto.notes = get(row, ['notes', 'الملاحظة']);
      const id = get(row, ['id', 'المعرف']) || undefined;
      if (id && !isUUID(id))
        throw new BadRequestException(`الصف ${row}: المعرّف ليس UUID صالحاً.`);
      if (validateSync(dto).length)
        throw new BadRequestException(
          `الصف ${row}: بيانات غير صالحة أو أطول من المسموح.`,
        );
      rows.push({ dto, id, row });
    }
    if (!rows.length) throw new BadRequestException('الملف فارغ.');
      let imported = 0,
        updated = 0;
      const usedIds = new Set<string>();
      for (const r of rows) {
        if (r.id && usedIds.has(r.id))
          throw new BadRequestException(
            `الصف ${r.row}: معرّف مكرر داخل الملف.`,
          );
        if (r.id) usedIds.add(r.id);
        try {
          await this.write(db, user, r.dto, r.id);
        } catch (e) {
          if (
            e instanceof BadRequestException ||
            e instanceof ForbiddenException ||
            e instanceof ConflictException
          )
            throw new BadRequestException(`الصف ${r.row}: ${e.message}`);
          throw e;
        }
        if (r.id) updated++;
        else imported++;
      }
      await db.auditLog.create({
        data: {
          organizationId: user.organizationId!,
          actorId: user.id,
          action: 'CREATE',
          entityType: 'DoctorImport',
          entityId: user.id,
          afterData: { hash, imported, updated },
        },
      });
      return { imported, updated, replayed: false };
    });
  }
}
