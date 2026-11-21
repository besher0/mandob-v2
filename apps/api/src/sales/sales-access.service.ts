import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class SalesAccessService {
  constructor(private readonly db: PrismaService) {}
  async scope(user: AuthUser, mode: 'read' | 'submit' | 'review' = 'read') {
    const roleCodes =
      mode === 'submit'
        ? ['SALES_MANAGER']
        : mode === 'review'
          ? ['NATIONAL_MANAGER']
          : ['SALES_MANAGER', 'NATIONAL_MANAGER'];
    if (!user.organizationId) throw new ForbiddenException();
    const actor = await this.db.user.findFirst({
      where: {
        id: user.id,
        organizationId: user.organizationId,
        status: 'ACTIVE',
        deletedAt: null,
        roles: { some: { role: { code: { in: roleCodes } } } },
      },
      select: { roles: { select: { role: { select: { code: true } } } } },
    });
    if (!actor)
      throw new ForbiddenException('لا تملك صلاحية المبيعات المطلوبة.');
    return {
      organizationId: user.organizationId,
      manager: actor.roles.some((row) => row.role.code === 'NATIONAL_MANAGER'),
    };
  }
}
