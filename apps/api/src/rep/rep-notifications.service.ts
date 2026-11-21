import { ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
@Injectable()
export class RepNotificationsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(user: AuthUser) {
    if (!user.organizationId)
      throw new ForbiddenException('الحساب غير مرتبط بشركة.');
    const where = { organizationId: user.organizationId, userId: user.id };
    const [items, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          createdAt: true,
          readAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items, total };
  }
}
