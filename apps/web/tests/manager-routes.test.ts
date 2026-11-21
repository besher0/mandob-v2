import assert from 'node:assert/strict';
import { test } from 'node:test';
import { managerHref, parseManagerRoute } from '../src/features/manager/manager-routes';
import { pages } from '../src/features/manager/manager-navigation';
test('manager sections and UUID details resolve; unknown and malformed paths are rejected', () => {
  for (const [page] of pages) assert.deepEqual(parseManagerRoute(managerHref(page).slice(9).split('/')), { page });
  const id = 'd3eb231c-84b4-4c37-823a-dc2393dedc08';
  for (const page of ['rep', 'area-detail', 'team-detail'] as const) {
    assert.deepEqual(parseManagerRoute(managerHref(page, id).slice(9).split('/')), { page, id });
    assert.throws(() => managerHref(page));
  }
  for (const parts of [[], ['unknown'], ['doctors', 'extra'], ['rep'], ['rep','name'], ['rep',id,'extra']]) assert.equal(parseManagerRoute(parts), null);
});
