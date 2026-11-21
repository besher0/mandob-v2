import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import type { AuthenticatedUser } from '../common/types/authenticated-user.type.js';
import { delegatedCodes } from '../company/company-access.js';
import type { LoginDto } from './dto/login.dto.js';

const authUserInclude = {
  roles: {
    include: {
      role: {
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.UserInclude;

type AuthUser = Prisma.UserGetPayload<{
  include: typeof authUserInclude;
}>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const username = dto.username.trim();

    const user = await this.prisma.user.findUnique({
      where: { username },
      include: authUserInclude,
    });

    const isPasswordValid = user
      ? await bcrypt.compare(dto.password, user.passwordHash)
      : false;

    if (
      !user ||
      !isPasswordValid ||
      user.status !== 'ACTIVE' ||
      user.deletedAt
    ) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.createSession(user);
  }

  async refresh(rawRefreshToken: string) {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: authUserInclude,
        },
      },
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt <= new Date() ||
      storedToken.user.status !== 'ACTIVE' ||
      storedToken.user.deletedAt
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token.');
    }

    return this.rotateSession(storedToken.id, storedToken.user);
  }

  async logout(rawRefreshToken: string) {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);

    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { success: true };
  }

  async resolveAccess(
    identity: Pick<AuthenticatedUser, 'sub' | 'organizationId'>,
  ): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: identity.sub },
      include: authUserInclude,
    });

    if (
      !user ||
      user.status !== 'ACTIVE' ||
      user.deletedAt ||
      user.organizationId !== identity.organizationId
    ) {
      throw new UnauthorizedException('User is unavailable.');
    }

    return this.buildAccessPayload(user);
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: authUserInclude,
    });

    if (!user || user.status !== 'ACTIVE' || user.deletedAt) {
      throw new UnauthorizedException('User is unavailable.');
    }

    return this.serializeUser(user);
  }

  private async createSession(user: AuthUser) {
    const refreshToken = this.generateRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const refreshExpiresAt = this.getRefreshExpiry();

    await this.prisma.refreshToken.deleteMany({
      where: {
        userId: user.id,
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      ...(await this.createAccessToken(user)),
      refreshToken,
      refreshExpiresAt,
      user: this.serializeUser(user),
    };
  }

  private async rotateSession(refreshTokenId: string, user: AuthUser) {
    const nextRefreshToken = this.generateRefreshToken();
    const nextTokenHash = this.hashRefreshToken(nextRefreshToken);
    const nextExpiresAt = this.getRefreshExpiry();

    await this.prisma.$transaction([
      this.prisma.refreshToken.update({
        where: { id: refreshTokenId },
        data: { revokedAt: new Date() },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: nextTokenHash,
          expiresAt: nextExpiresAt,
        },
      }),
    ]);

    return {
      ...(await this.createAccessToken(user)),
      refreshToken: nextRefreshToken,
      refreshExpiresAt: nextExpiresAt,
      user: this.serializeUser(user),
    };
  }

  private async createAccessToken(user: AuthUser) {
    const ttlSeconds = Number(
      this.configService.get<string>('JWT_ACCESS_TTL_SECONDS') ?? '900',
    );

    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
      throw new Error('JWT_ACCESS_TTL_SECONDS must be a positive number');
    }

    const payload = this.buildAccessPayload(user);

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: ttlSeconds,
    });

    return {
      accessToken,
      accessTokenExpiresInSeconds: ttlSeconds,
    };
  }

  private buildAccessPayload(user: AuthUser): AuthenticatedUser {
    const validRoles = user.roles.filter(({ role }) =>
      role.isSystem
        ? role.organizationId === null
        : !!user.organizationId && role.organizationId === user.organizationId,
    );
    const roles = [
      ...new Set(
        validRoles
          .filter(({ role }) => role.isSystem)
          .map(({ role }) => role.code),
      ),
    ];
    const permissions = [
      ...new Set(
        validRoles.flatMap(({ role }) =>
          role.permissions
            .map(({ permission }) => permission.code)
            .filter((code) => role.isSystem || delegatedCodes.has(code)),
        ),
      ),
    ];

    return {
      sub: user.id,
      organizationId: user.organizationId,
      username: user.username,
      roles,
      permissions,
      type: 'access',
    };
  }

  private serializeUser(user: AuthUser) {
    const access = this.buildAccessPayload(user);

    return {
      id: user.id,
      organizationId: user.organizationId,
      name: user.name,
      username: user.username,
      email: user.email,
      status: user.status,
      roles: access.roles,
      permissions: access.permissions,
    };
  }

  private generateRefreshToken(): string {
    return randomBytes(64).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getRefreshExpiry(): Date {
    const days = this.configService.get<number>('REFRESH_TOKEN_DAYS') ?? 30;
    const expiresAt = new Date();
    expiresAt.setUTCDate(expiresAt.getUTCDate() + days);
    return expiresAt;
  }
}
