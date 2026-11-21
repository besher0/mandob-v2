import { describe, it, expect } from 'vitest';
import { RequestLimits, loginKey } from '../src/security/request-limits.js';

describe('request limits', () => {
  it('isolates accounts, rejects excess and resets after the window', () => {
    const limits = new RequestLimits();
    for (let i=0;i<10;i++) limits.check('a',10,60,0);
    expect(() => limits.check('a',10,60,1)).toThrow();
    expect(() => limits.check('b',10,60,1)).not.toThrow();
    expect(() => limits.check('a',10,60,60000)).not.toThrow();
  });
  it('keeps light operations available when heavy capacity is full and releases once', () => {
    const limits = new RequestLimits();
    const releases = Array.from({length:4},()=>limits.acquire(true));
    expect(()=>limits.acquire(true)).toThrow();
    const light = limits.acquire(false);
    releases[0](); releases[0]();
    const heavy = limits.acquire(true);
    expect(()=>limits.acquire(true)).toThrow();
    heavy();light();releases.forEach(release=>release());
  });
  it('bounds simultaneous execution and accepts work after release',()=>{
    const limits = new RequestLimits();
    const releases = Array.from({length:100},()=>limits.acquire(false));
    expect(()=>limits.acquire(false)).toThrow();
    releases[0]();
    expect(()=>limits.acquire(false)).not.toThrow();
  });
  it('does not retain raw login names in keys',()=>{
    expect(loginKey(' user ')).toBe(loginKey('user'));
    expect(loginKey('user')).toHaveLength(64);
  });
});
