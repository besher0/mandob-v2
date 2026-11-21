import { hasCompanyAccess } from '../company/company-access.js';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ConflictException,
} from '@nestjs/common';
import { IsString, IsUUID, IsOptional, MaxLength } from 'class-validator';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth.types.js';
export class AreaGroupDto {
  @IsString() @MaxLength(120) name: string;
  @IsUUID() provinceId: string;
}
export class AreaDto extends AreaGroupDto {
  @IsOptional() @IsUUID() groupId?: string | null;
}
@Injectable()
export class AreaManagementService {
  constructor(private readonly db: PrismaService) {}
  private async provinces(db: Prisma.TransactionClient, user: AuthUser, write = false) {
    if (!user.organizationId) throw new ForbiddenException();
    if(await hasCompanyAccess(db,user,write?'areas.manage':'areas.view')){
      return db.province.findMany({where:{organizationId:user.organizationId,deletedAt:null},select:{id:true,name:true},orderBy:{name:'asc'}});
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
      select: { provinceId: true },
    });
    return db.province.findMany({
      where: {
        organizationId: user.organizationId,
        deletedAt: null,
        id: { in: teams.flatMap((t) => (t.provinceId ? [t.provinceId] : [])) },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
  async catalog(user: AuthUser) {
    const provinces = await this.provinces(this.db, user);
    const provinceId = { in: provinces.map((p) => p.id) };
    const [groups, areas] = await Promise.all([
      this.db.areaGroup.findMany({
        where: { provinceId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.db.area.findMany({
        where: {
          provinceId,
          organizationId: user.organizationId!,
          deletedAt: null,
        },
        select: { id: true, name: true, provinceId: true, groupId: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { provinces, groups, areas };
  }
  async save(
    user: AuthUser,
    dto: AreaDto,
    kind: 'area' | 'group',
    id?: string,
  ) {
    if (!user.permissions.includes('areas.manage_own'))
      throw new ForbiddenException();
    try {
      return await this.db.$transaction(
        async (db) => {
          const provinces = await this.provinces(db, user, true);
          if (!provinces.some((p) => p.id === dto.provinceId))
            throw new ForbiddenException('المحافظة خارج نطاقك.');
          const name = dto.name.trim();
          if (!name) throw new BadRequestException('الاسم مطلوب.');
          let result: { id: string };
          if (kind === 'group') {
            result = await db.areaGroup.create({
              data: { name, provinceId: dto.provinceId },
            });
          } else {
            if (
              dto.groupId &&
              !(await db.areaGroup.findFirst({
                where: { id: dto.groupId, provinceId: dto.provinceId },
              }))
            )
              throw new ForbiddenException('المجموعة لا تتبع المحافظة.');
            if (
              id &&
              !(await db.area.findFirst({
                where: {
                  id,
                  organizationId: user.organizationId!,
                  provinceId: dto.provinceId,
                  deletedAt: null,
                },
              }))
            )
              throw new ForbiddenException('المنطقة خارج نطاقك.');
            const data = { name, groupId: dto.groupId ?? null };
            result = id
              ? await db.area.update({ where: { id }, data })
              : await db.area.create({
                  data: {
                    ...data,
                    provinceId: dto.provinceId,
                    organizationId: user.organizationId!,
                  },
                });
          }
          await db.auditLog.create({
            data: {
              organizationId: user.organizationId!,
              actorId: user.id,
              action: id ? 'UPDATE' : 'CREATE',
              entityType: kind === 'area' ? 'Area' : 'AreaGroup',
              entityId: result.id,
              afterData: {
                name,
                provinceId: dto.provinceId,
                groupId: dto.groupId ?? null,
              },
            },
          });
          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      )
        throw new ConflictException('الاسم موجود ضمن المحافظة.');
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2034'
      )
        throw new ConflictException('تعديل متزامن؛ أعد المحاولة.');
      throw e;
    }
  }
}
