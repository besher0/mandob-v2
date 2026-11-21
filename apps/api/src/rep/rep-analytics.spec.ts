import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalyticsQueryDto } from './dto/analytics-query.dto.js';
import { analysisTotals, analysisWindow } from './rep-analytics.service.js';
describe('representative analytics', () => {
  it('keeps legacy average fulfillment distinct from weighted coverage and caps extra visits', () => {
    const totals = analysisTotals([
      { completedVisits: 1, requiredVisits: 4, class: { code: 'A' } },
      { completedVisits: 3, requiredVisits: 1, class: { code: 'B' } },
      { completedVisits: 0, requiredVisits: 1, class: { code: 'C' } },
    ]);
    expect(totals).toMatchObject({
      compliance: 42,
      coverage: 33,
      complete: 1,
      behind: 1,
      unvisited: 1,
      aVisits: 1,
    });
    expect(analysisTotals([])).toMatchObject({
      compliance: 0,
      coverage: 0,
      total: 0,
    });
  });
  it('bounds calendar periods to the cycle and clamps historical cycles to their end date', () => {
    expect(
      analysisWindow('2026-09-01', '2026-10-15', '2026-09-26', 'week'),
    ).toEqual({ from: '2026-09-21', to: '2026-09-26' });
    expect(
      analysisWindow('2026-09-24', '2026-10-15', '2026-09-26', 'month'),
    ).toEqual({ from: '2026-09-24', to: '2026-09-26' });
    expect(
      analysisWindow('2026-08-01', '2026-08-31', '2026-09-26', 'cycle'),
    ).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });
  it('rejects names in ID filters and unknown period values', async () => {
    const invalid = plainToInstance(AnalyticsQueryDto, {
      areaId: 'حلب',
      classId: 'A',
      period: 'forever',
    });
    expect(await validate(invalid)).toHaveLength(3);
  });
});
