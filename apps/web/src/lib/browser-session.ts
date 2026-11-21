import { createClientRef } from "./client-ref";

const STORAGE_KEY = "medrep.browser-session";
let fallbackScope: string | undefined;

// A routing identifier only; credentials remain in HttpOnly cookies.
export function browserApiBase(fresh = false): string {
  if (typeof window === "undefined") return "/api/browser";
  let scope: string | null = null;
  try { scope = window.sessionStorage.getItem(STORAGE_KEY); } catch { scope = fallbackScope ?? null; }
  if (fresh || !scope || !/^[0-9a-f-]{36}$/i.test(scope)) {
    scope = createClientRef();
    fallbackScope = scope;
    try { window.sessionStorage.setItem(STORAGE_KEY, scope); } catch { /* Restricted storage uses memory. */ }
  }
  return `/api/browser/__session/${scope}`;
}
