import {describe,it,expect} from 'vitest';
import {calendarPeriods} from '../src/cycles/calendar.js';
describe('calendar cycle boundaries',()=>{
 for(const year of [2026,2028])for(const cadence of [{mode:'MONTHS',length:1},{mode:'MONTH_AND_HALF',length:1},{mode:'DAYS',length:45}] as const)it(`${year} ${cadence.mode} covers every day once`,()=>{
  const rows=calendarPeriods(year,cadence);expect(rows[0].start.toISOString().slice(0,10)).toBe(`${year}-01-01`);expect(rows.at(-1)!.end.toISOString().slice(0,10)).toBe(`${year}-12-31`);
  for(let i=1;i<rows.length;i++)expect(+rows[i].start-+rows[i-1].end).toBe(86400000);
 });
 it('uses the agreed half-month calendar, not 45-day periods',()=>{const rows=calendarPeriods(2028,{mode:'MONTH_AND_HALF',length:1});expect(rows).toHaveLength(8);expect(rows[0].end.toISOString().slice(0,10)).toBe('2028-02-15');expect(rows[1].start.toISOString().slice(0,10)).toBe('2028-02-16');expect(rows[1].end.toISOString().slice(0,10)).toBe('2028-03-31');});
});
