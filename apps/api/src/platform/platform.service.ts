import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { BrandingDto, CreateCompanyDto } from './platform.dto.js';
export const defaultBranding = { layout: 'CLASSIC', displayName: 'MedREP', primary: '#167c5a', accent: '#0f766e', sidebar: '#103d30', background: '#f6f8f7', font: 'Tahoma', style: 'CLASSIC', logo: '' };
@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}
  private async authorize(user: AuthUser) {
    // Check the current database role, not only a potentially stale JWT.
    const actor = await this.prisma.user.findFirst({ where: { id: user.id, status: 'ACTIVE', deletedAt: null, roles: { some: { role: { code: 'SUPER_ADMIN' } } } }, select: { id: true } });
    if (!actor) throw new ForbiddenException('هذه العملية للسوبر أدمن فقط.');
  }
  async list(user: AuthUser) {
    await this.authorize(user);
    return { items: await this.prisma.organization.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true, status: true, createdAt: true, _count: { select: { users: true, teams: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 501 }) };
  }
  async create(user: AuthUser, dto: CreateCompanyDto) {
    await this.authorize(user);
    if (!dto.name.trim() || !dto.ownerName.trim() || Buffer.byteLength(dto.password, 'utf8') > 72) throw new BadRequestException('تحقق من الاسم وكلمة المرور (حتى 72 بايت).');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      return await this.prisma.$transaction(async db => {
        const role = await db.role.findUnique({ where: { code: 'NATIONAL_MANAGER' } });
        if (!role) throw new BadRequestException('دور صاحب الشركة غير مهيأ.');
        const org = await db.organization.create({ data: { name: dto.name.trim(), code: dto.code, settings: { create: { branding: { ...defaultBranding, displayName: dto.name.trim() } } } } });
        const owner = await db.user.create({ data: { organizationId: org.id, name: dto.ownerName.trim(), username: dto.username, passwordHash, roles: { create: { roleId: role.id } } } });
        await db.auditLog.create({ data: { organizationId: org.id, actorId: user.id, action: 'CREATE', entityType: 'Organization', entityId: org.id, afterData: { code: org.code, ownerId: owner.id } } });
        return { id: org.id, name: org.name, ownerId: owner.id, username: owner.username };
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('رمز الشركة أو اسم الدخول مستخدم مسبقاً.');
      throw e;
    }
  }
  private async read(id: string) {
    const org = await this.prisma.organization.findFirst({ where: { id, deletedAt: null }, select: { name: true, settings: { select: { branding: true, brandingRevision: true, roundLocationPolicy: true } } } });
    if (!org) throw new NotFoundException('الشركة غير موجودة.');
    return { ...defaultBranding, ...(org.settings?.branding as object ?? {}), roundLocationPolicy: org.settings?.roundLocationPolicy ?? "DISABLED", revision: org.settings?.brandingRevision ?? 0 };
  }
  async ownBranding(user: AuthUser) {
    if (!user.organizationId) return { ...defaultBranding, revision: 0 };
    return this.read(user.organizationId);
  }
  async branding(user: AuthUser, id: string) { await this.authorize(user); return this.read(id); }
  async saveBranding(user: AuthUser, id: string, dto: BrandingDto) {
    await this.authorize(user);
    if (!dto.displayName.trim()) throw new BadRequestException('اسم العرض مطلوب.');
    if (dto.logo) {
      const mime = dto.logo.slice(11, dto.logo.indexOf(';'));
      const data = Buffer.from(dto.logo.split(',')[1], 'base64');
      const valid = mime === 'png' ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === 'jpeg' ? data[0] === 255 && data[1] === 216 && data[2] === 255 : data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
      if (!valid) throw new BadRequestException('صورة الشعار غير صالحة.');
    }
    const { revision, roundLocationPolicy, ...theme } = dto;
    return this.prisma.$transaction(async db => {
      const org = await db.organization.findFirst({ where: { id, deletedAt: null } });
      if (!org) throw new NotFoundException('الشركة غير موجودة.');
      await db.organizationSettings.upsert({ where: { organizationId: id }, create: { organizationId: id }, update: {} });
      const before = await db.organizationSettings.findUniqueOrThrow({ where: { organizationId: id } });
      theme.accent ??= (before.branding as {accent?: string} | null)?.accent ?? defaultBranding.accent;
      const changed = await db.organizationSettings.updateMany({ where: { organizationId: id, brandingRevision: revision }, data: { ...(roundLocationPolicy ? {roundLocationPolicy} : {}), branding: { ...theme, displayName: theme.displayName.trim() }, brandingRevision: { increment: 1 } } });
      if (!changed.count) throw new ConflictException('تم تعديل الثيم من جلسة أخرى؛ أعد فتح الشركة قبل الحفظ.');
      await db.auditLog.create({ data: { organizationId: id, actorId: user.id, action: 'UPDATE', entityType: 'OrganizationBranding', entityId: id, beforeData: before.branding ?? {}, afterData: { ...theme, roundLocationPolicy: roundLocationPolicy ?? before.roundLocationPolicy, revision: revision + 1 } } });
      return { ...theme, roundLocationPolicy: roundLocationPolicy ?? before.roundLocationPolicy, revision: revision + 1 };
    });
  }
}
