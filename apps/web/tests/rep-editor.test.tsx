import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { useRepEditorForm } from '../src/features/manager/useRepEditorForm';
import type { RepEditorOptions } from '../src/features/manager/rep-editor.types';

const named = (id: string) => ({ id, name: id });
const options: RepEditorOptions = {
  teams: ['rx', 'otc', 'other'].map(id => ({ ...named(id), provinceId: id,
    specialties: [named(`${id}-specialty`)], products: [named(`${id}-product`)] })),
  areas: ['rx', 'otc'].map(id => ({ ...named(`${id}-area`), provinceId: id })),
  rep: { ...named('rep'), username: 'representative', shared: true, dailyVisitTarget: 8,
    assignments: ['rx', 'otc'].map(teamId => ({ teamId, areaIds: [`${teamId}-area`],
      productIds: [`${teamId}-product`], specialtyIds: [`${teamId}-specialty`] })) },
};

test('editor keeps team assignments separate, submits once, and retries after rejection', async () => {
  const dom = new JSDOM('<div id="root"></div>');
  const originalFetch = globalThis.fetch;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(document.getElementById('root')!);
  let form!: ReturnType<typeof useRepEditorForm>;
  let saved = '';
  const calls: { url: string; init?: RequestInit }[] = [];
  let release!: (response: Response) => void;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Promise<Response>(resolve => { release = resolve; });
  };
  function Probe({ data }: { data: RepEditorOptions }) {
    form = useRepEditorForm({ data, token: 'cookie-session', onSaved: message => { saved = message; } });
    return null;
  }
  const event = { preventDefault() {} } as FormEvent;
  try {
    await act(async () => root.render(<Probe data={options}/>));
    assert.deepEqual(form.availableTeams.map(t => t.id), ['rx', 'otc']);
    await act(async () => form.selectTeam('otc'));
    assert.deepEqual(form.areaIds, ['otc-area']);
    assert.deepEqual(form.productIds, ['otc-product']);
    await act(async () => form.selectTeam('rx'));
    assert.deepEqual(form.areaIds, ['rx-area']);
    await act(async () => { form.setCustom(true); form.setSpecialties(['rx-specialty', 'otc-specialty']); form.setProducts(['rx-product', 'otc-product']); });
    let pending!: Promise<void>;
    await act(async () => { pending = form.submit(event); void form.submit(event); });
    assert.equal(calls.length, 1);
    assert.equal(form.busy, true);
    assert.ok(calls[0].url.endsWith('/manager/reps/rep'));
    assert.equal(calls[0].init?.method, 'PATCH');
    const payload = JSON.parse(String(calls[0].init?.body));
    assert.deepEqual(payload.specialtyIds, ['rx-specialty']);
    assert.deepEqual(payload.productIds, ['rx-product']);
    assert.equal('password' in payload, false);
    assert.equal('username' in payload, false);
    await act(async () => { release(Response.json({ message: 'رفض الخادم' }, { status: 400 })); await pending; });
    assert.equal(form.busy, false);
    assert.match(form.error, /رفض الخادم/);
    assert.equal(saved, '');
    await act(async () => { pending = form.submit(event); });
    await act(async () => { release(Response.json({ id: 'rep', effectiveOn: '2026-10-18', targetCount: 3 })); await pending; });
    assert.match(saved, /2026-10-18/);
    assert.equal(form.error, '');
    // A fresh create form uses team defaults and includes credentials only on POST.
    await act(async () => root.render(<Probe key="new" data={{ ...options, rep: null }}/>));
    await act(async () => { form.selectTeam('otc'); form.setUsername('new.rep'); form.setPassword('test-only-password'); form.setDaily('8'); });
    assert.deepEqual(form.areaIds, []);
    assert.deepEqual(form.productIds, ['otc-product']);
    await act(async () => { pending = form.submit(event); });
    const created = JSON.parse(String(calls[2].init?.body));
    assert.equal(calls[2].init?.method, 'POST');
    assert.equal(created.username, 'new.rep');
    assert.deepEqual(created.specialtyIds, ['otc-specialty']);
    await act(async () => { release(Response.json({ id: 'new', effectiveOn: '2026-10-18', targetCount: 0 })); await pending; });
    assert.equal(form.password, '');
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.window.close();
  }
});
