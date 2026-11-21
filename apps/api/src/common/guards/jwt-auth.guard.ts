import { RequestLimits, loginKey } from '../../security/request-limits.js';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../../auth/auth.service.js';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import type { AuthenticatedUser } from '../types/authenticated-user.type.js';

type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly limits: RequestLimits,
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const release = this.limits.acquire(false);
    try { return await this.authorize(context); }
    finally { release(); }
  }

  private async authorize(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    this.limits.check('global', 3000, 60);
    if (req.path.endsWith('/auth/login')) {
      this.limits.check('login-global', 300, 60);
      this.limits.check('login:' + loginKey(req.body?.username), 10, 60);
    }
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required.');
    }

    let payload: AuthenticatedUser;
    try {
      payload = await this.jwtService.verifyAsync<AuthenticatedUser>(token, {
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      if (
        payload.type !== 'access' ||
        typeof payload.sub !== 'string' ||
        (payload.organizationId !== null &&
          typeof payload.organizationId !== 'string')
      ) {
        throw new UnauthorizedException('Invalid access token.');
      }
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    this.limits.check('account:' + payload.sub, 240, 60);
    // Resolve current grants after verification: revoked roles must not survive in an old JWT.
    request.user = await this.authService.resolveAccess(payload);
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
