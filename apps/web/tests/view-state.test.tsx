import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import React, { act, type Dispatch, type SetStateAction } from "react";
import { createRoot } from "react-dom/client";
import { ViewStateProvider, useViewState } from "../src/lib/view-state";

test("view preferences restore per key/account and survive remount; invalid storage is tolerated", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "http://localhost" });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document,
    sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true });
  let change: Dispatch<SetStateAction<string>> = () => {};
  function Probe({ name }: { name: string }) {
    const [value, set] = useViewState(name, "default");
    change = set;
    return <span>{value}</span>;
  }
  const container = document.getElementById("root")!;
  let root = createRoot(container);
  const render = async (scope: string, name: string) => {
    await act(async () => { root.render(<ViewStateProvider scope={scope}><Probe name={name}/></ViewStateProvider>); });
    return container.textContent;
  };
  try {
    assert.equal(await render("company:owner", "aleppo"), "default");
    await act(async () => { change("cardiology"); });
    assert.equal(await render("company:owner", "damascus"), "default");
    await act(async () => { change("endocrinology"); });
    assert.equal(await render("company:owner", "aleppo"), "cardiology");
    assert.equal(await render("company:rep", "aleppo"), "default");
    assert.equal(await render("company:owner", "damascus"), "endocrinology");
    await act(async () => { root.unmount(); });
    root = createRoot(container);
    assert.equal(await render("company:owner", "aleppo"), "cardiology");
    sessionStorage.setItem("medrep:view:v1:company:owner:broken", "{");
    assert.equal(await render("company:owner", "broken"), "default");
    const prototype = Object.getPrototypeOf(sessionStorage);
    const original = prototype.setItem;
    prototype.setItem = () => { throw new Error("storage blocked"); };
    try {
      await act(async () => { change("still usable"); });
      assert.equal(container.textContent, "still usable");
    } finally { prototype.setItem = original; }
  } finally {
    await act(async () => { root.unmount(); });
    dom.window.close();
  }
});
