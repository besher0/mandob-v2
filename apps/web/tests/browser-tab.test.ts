import { test } from "node:test";
import assert from "node:assert/strict";
import { browserApiBase } from "../src/lib/browser-session";

test("tab scope survives refresh, differs between tabs and rotates on login", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const makeTab = () => {
    const values = new Map<string, string>();
    return {sessionStorage: {getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value)}};
  };
  const firstTab = makeTab();
  try {
    Object.defineProperty(globalThis, "window", {configurable: true, value: firstTab});
    const first = browserApiBase();
    assert.equal(browserApiBase(), first);
    Object.defineProperty(globalThis, "window", {configurable: true, value: makeTab()});
    assert.notEqual(browserApiBase(), first);
    Object.defineProperty(globalThis, "window", {configurable: true, value: firstTab});
    assert.equal(browserApiBase(), first);
    assert.notEqual(browserApiBase(true), first);
    assert.match(browserApiBase(), /^\/api\/browser\/__session\/[0-9a-f-]{36}$/);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("local HTTP login creates and restores a scope without randomUUID", () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousCrypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  const secureCrypto = globalThis.crypto;
  const storage = new Map<string, string>();
  let randomCalls = 0;
  try {
    Object.defineProperty(globalThis, "crypto", {configurable: true, value: {
      getRandomValues: (bytes: Uint8Array) => {
        randomCalls++;
        return secureCrypto.getRandomValues(bytes);
      },
    }});
    Object.defineProperty(globalThis, "window", {configurable: true, value: {
      sessionStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
    }});
    const base = browserApiBase(true);
    assert.match(base, /^\/api\/browser\/__session\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(browserApiBase(), base);
    assert.notEqual(browserApiBase(true), base);
    assert.equal(randomCalls, 2);
  } finally {
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (previousCrypto) Object.defineProperty(globalThis, "crypto", previousCrypto);
  }
});
