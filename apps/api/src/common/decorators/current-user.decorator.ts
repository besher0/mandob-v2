import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth.types.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const request = context.switchToHttp().getRequest();

    const user = request.user;

    return {
      id: user.id ?? user.sub,
      organizationId: user.organizationId ?? null,
      name: user.name ?? user.username,
      username: user.username,
      email: user.email ?? null,
      status: user.status ?? 'ACTIVE',
      roles: user.roles ?? [],
      permissions: user.permissions ?? [],
    };
  },
);
