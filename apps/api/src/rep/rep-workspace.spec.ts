import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterRoundDto } from './dto/round.dto.js';
import { dateInZone, visitInstant } from './rep-workspace.service.js';
import { PermissionsGuard } from '../common/guards/permissions.guard.js';
import { Reflector } from '@nestjs/core';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import type { ExecutionContext } from '@nestjs/common';

describe('round input boundaries', () => {
  it('rejects impossible calendar dates and preserves the local visit date', () => {
    expect(() => visitInstant('2026-02-30', 'Asia/Damascus')).toThrow();
    expect(
      dateInZone(visitInstant('2026-09-25', 'Asia/Damascus'), 'Asia/Damascus'),
    ).toBe('2026-09-25');
    expect(dateInZone(new Date('2026-09-24T22:00:00Z'), 'Asia/Damascus')).toBe(
      '2026-09-25',
    );
  });
  it('rejects names, repeated targets, missing areas and unknown fields', async () => {
    const input = plainToInstance(RegisterRoundDto, {
      clientRef: 'not-a-uuid',
      cycleId: 'a name',
      type: 'DOCTOR',
      areaIds: [],
      targetIds: ['same', 'same'],
      productIds: [],
      visitDate: 'tomorrow',
      repId: 'someone-else',
    });
    const errors = await validate(input, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.map((e) => e.property)).toEqual(
      expect.arrayContaining([
        'clientRef',
        'cycleId',
        'areaIds',
        'targetIds',
        'visitDate',
        'repId',
      ]),
    );
  });
});

describe('existing permission decorator compatibility', () => {
  class Endpoint {
    @Permissions('targets.view') read(this: void) {}
  }
  const guard = new PermissionsGuard(new Reflector());
  const context = (permissions: string[]) =>
    ({
      getHandler: () => Endpoint.prototype.read,
      getClass: () => Endpoint,
      switchToHttp: () => ({ getRequest: () => ({ user: { permissions } }) }),
    }) as unknown as ExecutionContext;
  it('enforces the same key on old and new endpoints', () => {
    expect(() => guard.canActivate(context([]))).toThrow();
    expect(guard.canActivate(context(['targets.view']))).toBe(true);
  });
});
