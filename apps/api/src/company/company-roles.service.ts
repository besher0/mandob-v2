import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth.types.js';
import { delegatedPermissions, delegatedCodes } from './company-access.js';
import { ManagerIdentityDto } from './company.service.js';

export class CompanyRoleDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(30)
  @IsUUID('all', { each: true })
  permissionIds: string[];
}
export class EditCompanyRoleDto extends CompanyRoleDto {
  @IsInt() @Min(0) revision: number;
}
export class CreateStaffDto extends ManagerIdentityDto {
  @IsString() @MinLength(10) @MaxLength(72) password: string;
  @IsUUID() roleId: string;
}
export class EditStaffDto extends ManagerIdentityDto {
  @IsUUID() roleId: string;
  @IsIn(['ACTIVE', 'SUSPENDED']) status: 'ACTIVE' | 'SUSPENDED';
  @IsISO8601() expectedUpdatedAt: string;
}

@Injectable()
export class CompanyRolesService {
  constructor(private readonly db: PrismaService) {}
  private async authorize(
    db: Prisma.TransactionClient,
    user: AuthUser,
    companyId?: string,
  ) {
    const actor = await db.user.findFirst({
      where: { id: user.id, status: 'ACTIVE', deletedAt: null },
      include: { roles: { include: { role: true } } },
    });
    const root = actor?.roles.some(
      (r) =>
        r.role.isSystem &&
        !r.role.organizationId &&
        r.role.code === 'SUPER_ADMIN',
    );
    const owner = actor?.roles.some(
      (r) =>
        r.role.isSystem &&
        !r.role.organizationId &&
        r.role.code === 'NATIONAL_MANAGER',
    );
    const organizationId = companyId ?? actor?.organizationId;
    if (
      !actor ||
      !organizationId ||
      (!root &&
        (!owner || companyId || actor.organizationId !== user.organizationId))
    )
      throw new ForbiddenException(
        'إدارة الأدوار لصاحب الشركة والسوبر أدمن فقط.',
      );
    if (
      !(await db.organization.findFirst({
        where: { id: organizationId, deletedAt: null },
        select: { id: true },
      }))
    )
      throw new ForbiddenException('الشركة غير متاحة.');
    return organizationId;
  }
  private async write<T>(fn: (db: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.db.$transaction(fn, { isolationLevel: 'Serializable' });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002')
          throw new ConflictException('اسم الدخول مستخدم مسبقاً.');
        if (e.code === 'P2034')
          throw new ConflictException(
            'حصل تعديل متزامن؛ حدّث البيانات وأعد المحاولة.',
          );
      }
      throw e;
    }
  }
  async options(user: AuthUser, companyId?: string) {
    const organizationId = await this.authorize(this.db, user, companyId);
    const [permissions, roles, staff] = await Promise.all([
      this.db.permission.findMany({
        where: { code: { in: [...delegatedCodes] } },
        select: { id: true, code: true },
      }),
      this.db.role.findMany({
        where: { organizationId, isSystem: false },
        select: {
          id: true,
          name: true,
          revision: true,
          permissions: { select: { permissionId: true } },
          _count: { select: { users: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.db.user.findMany({
        where: {
          organizationId,
          deletedAt: null,
          roles: {
            some: {
              role: {
                code: 'COMPANY_STAFF',
                isSystem: true,
                organizationId: null,
              },
            },
          },
        },
        select: {
          id: true,
          name: true,
          username: true,
          status: true,
          updatedAt: true,
          roles: {
            where: { role: { organizationId, isSystem: false } },
            select: { roleId: true },
          },
        },
        orderBy: { name: 'asc' },
      }),
    ]);
    const byCode = new Map(permissions.map((p) => [p.code, p.id]));
    const choices = delegatedPermissions.map((p) => ({
      id: byCode.get(p.code),
      name: p.name,
      requires: p.requires.map((code) => byCode.get(code)),
    }));
    if (choices.some((p) => !p.id || p.requires.some((id) => !id)))
      throw new BadRequestException('دليل الصلاحيات غير مكتمل.');
    const primaryIds = new Set(choices.map((p) => p.id));
    return {
      permissions: choices,
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        revision: r.revision,
        permissionIds: r.permissions
          .map((p) => p.permissionId)
          .filter((id) => primaryIds.has(id)),
        staffCount: r._count.users,
      })),
      staff: staff.map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        status: u.status,
        updatedAt: u.updatedAt,
        roleId: u.roles[0]?.roleId ?? '',
      })),
    };
  }
  async role(
    user: AuthUser,
    dto: CompanyRoleDto,
    id?: string,
    revision?: number,
    companyId?: string,
  ) {
    return this.write(async (db) => {
      const organizationId = await this.authorize(db, user, companyId),
        name = dto.name.trim();
      if (!name) throw new BadRequestException('اسم الدور مطلوب.');
      const before = id
        ? await db.role.findFirst({
            where: { id, organizationId, isSystem: false },
            include: { permissions: true },
          })
        : null;
      if (id && !before)
        throw new ForbiddenException('الدور خارج نطاق الشركة.');
      if (before && before.revision !== revision)
        throw new ConflictException('تغير الدور؛ حدّث الصفحة وأعد المحاولة.');
      if (
        await db.role.findFirst({
          where: {
            organizationId,
            name: { equals: name, mode: 'insensitive' },
            ...(id ? { id: { not: id } } : {}),
          },
        })
      )
        throw new ConflictException('اسم الدور موجود في الشركة.');
      const catalog = await db.permission.findMany({
        where: { code: { in: [...delegatedCodes] } },
      });
      const requested = catalog.filter((p) => dto.permissionIds.includes(p.id));
      if (
        requested.length !== dto.permissionIds.length ||
        requested.some(
          (p) => !delegatedPermissions.some((d) => d.code === p.code),
        )
      )
        throw new BadRequestException('توجد صلاحية غير قابلة للتفويض.');
      const codes = new Set(
        requested.flatMap((p) => {
          const choice = delegatedPermissions.find((d) => d.code === p.code)!;
          return [choice.code, ...choice.requires];
        }),
      );
      const permissions = catalog
        .filter((p) => codes.has(p.code))
        .map((p) => ({ permissionId: p.id }));
      if (permissions.length !== codes.size)
        throw new BadRequestException('دليل الصلاحيات غير مكتمل.');
      const row = id
        ? await db.role.update({
            where: { id },
            data: {
              name,
              revision: { increment: 1 },
              permissions: { deleteMany: {}, create: permissions },
            },
          })
        : await db.role.create({
            data: {
              code: `COMPANY_${randomUUID()}`,
              name,
              organizationId,
              isSystem: false,
              permissions: { create: permissions },
            },
          });
      await db.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: id ? 'UPDATE' : 'CREATE',
          entityType: 'CompanyRole',
          entityId: row.id,
          ...(before
            ? {
                beforeData: {
                  name: before.name,
                  permissionIds: before.permissions.map((p) => p.permissionId),
                },
              }
            : {}),
          afterData: {
            name,
            permissionIds: permissions.map((p) => p.permissionId),
          },
        },
      });
      return { id: row.id, name, revision: row.revision };
    });
  }
  async createStaff(user: AuthUser, dto: CreateStaffDto, companyId?: string) {
    await this.authorize(this.db, user, companyId);
    if (!dto.name.trim() || Buffer.byteLength(dto.password, 'utf8') > 72)
      throw new BadRequestException('تحقق من الاسم وطول كلمة المرور.');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.write(async (db) => {
      const organizationId = await this.authorize(db, user, companyId);
      const role = await db.role.findFirst({
        where: { id: dto.roleId, organizationId, isSystem: false },
      });
      const marker = await db.role.findUnique({
        where: { code: 'COMPANY_STAFF' },
      });
      if (!role || !marker)
        throw new ForbiddenException('اختر دوراً خاصاً بهذه الشركة.');
      const row = await db.user.create({
        data: {
          organizationId,
          name: dto.name.trim(),
          username: dto.username,
          passwordHash,
          roles: { create: [{ roleId: marker.id }, { roleId: role.id }] },
        },
        select: { id: true, name: true, username: true },
      });
      await db.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: 'CREATE',
          entityType: 'CompanyStaff',
          entityId: row.id,
          afterData: { ...row, roleId: role.id },
        },
      });
      return row;
    });
  }
  async editStaff(
    user: AuthUser,
    id: string,
    dto: EditStaffDto,
    companyId?: string,
  ) {
    return this.write(async (db) => {
      const organizationId = await this.authorize(db, user, companyId);
      const before = await db.user.findFirst({
        where: { id, organizationId, deletedAt: null },
        include: { roles: { include: { role: true } } },
      });
      if (
        !before ||
        !before.roles.some((r) => r.role.code === 'COMPANY_STAFF') ||
        before.roles.some(
          (r) => r.role.isSystem && r.role.code !== 'COMPANY_STAFF',
        )
      )
        throw new ForbiddenException(
          'هذا الحساب ليس موظفاً مفوّضاً ضمن الشركة.',
        );
      if (
        before.updatedAt.toISOString() !==
        new Date(dto.expectedUpdatedAt).toISOString()
      )
        throw new ConflictException('تغير الحساب؛ حدّث الصفحة وأعد المحاولة.');
      if (!dto.name.trim()) throw new BadRequestException('الاسم مطلوب.');
      if (
        !(await db.role.findFirst({
          where: { id: dto.roleId, organizationId, isSystem: false },
        }))
      )
        throw new ForbiddenException('الدور خارج نطاق الشركة.');
      await db.userRole.deleteMany({
        where: { userId: id, role: { isSystem: false } },
      });
      await db.userRole.create({ data: { userId: id, roleId: dto.roleId } });
      const row = await db.user.update({
        where: { id },
        data: {
          name: dto.name.trim(),
          username: dto.username,
          status: dto.status,
        },
      });
      if (dto.status !== 'ACTIVE')
        await db.refreshToken.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await db.auditLog.create({
        data: {
          organizationId,
          actorId: user.id,
          action: 'UPDATE',
          entityType: 'CompanyStaff',
          entityId: id,
          beforeData: {
            name: before.name,
            username: before.username,
            status: before.status,
            roleIds: before.roles
              .filter((r) => !r.role.isSystem)
              .map((r) => r.roleId),
          },
          afterData: {
            name: row.name,
            username: row.username,
            status: row.status,
            roleId: dto.roleId,
          },
        },
      });
      return { id: row.id };
    });
  }
  async staffWorkspace(user: AuthUser) {
    const actor = await this.db.user.findFirst({
      where: {
        id: user.id,
        organizationId: user.organizationId,
        status: 'ACTIVE',
        deletedAt: null,
        roles: {
          some: {
            role: {
              code: 'COMPANY_STAFF',
              isSystem: true,
              organizationId: null,
            },
          },
        },
      },
      include: {
        roles: {
          where: {
            role: { isSystem: false, organizationId: user.organizationId },
          },
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });
    if (!actor?.organizationId) throw new ForbiddenException();
    const permissions = [
      ...new Set(
        actor.roles
          .flatMap((r) => r.role.permissions.map((p) => p.permission.code))
          .filter((p) => delegatedCodes.has(p)),
      ),
    ];
    const [specialties, products] = await Promise.all([
      permissions.includes('specialties.view')
        ? this.db.specialty.findMany({
            where: { organizationId: actor.organizationId, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [],
      permissions.includes('products.view')
        ? this.db.product.findMany({
            where: {
              organizationId: actor.organizationId,
              deletedAt: null,
              isActive: true,
            },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
          })
        : [],
    ]);
    return { permissions, specialties, products };
  }
}
