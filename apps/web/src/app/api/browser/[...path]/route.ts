import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";

export const runtime = "nodejs";
const ACCESS = "medrep_access";
const REFRESH = "medrep_refresh";
type Session = { accessToken: string; refreshToken: string; user: unknown };
const refreshing = new Map<string, Promise<Session | null>>();

function writeSession(response: NextResponse, request: NextRequest, session: Session | null, scope?: string) {
  const options = {
    httpOnly: true, sameSite: "strict" as const, path: scope ? `/api/browser/__session/${scope}` : "/api/browser",
    secure: process.env.SESSION_COOKIE_SECURE === "true" || request.nextUrl.protocol === "https:",
  };
  response.cookies.set(scope ? `${ACCESS}_${scope}` : ACCESS, session?.accessToken ?? "", { ...options, maxAge: session ? 86400 : 0 });
  response.cookies.set(scope ? `${REFRESH}_${scope}` : REFRESH, session?.refreshToken ?? "", { ...options, maxAge: session ? 7 * 86400 : 0 });
}
function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
async function upstream(path: string, method: string, body?: BodyInit, token?: string, contentType?: string) {
  const base = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:3001";
  return fetch(base + "/api/v1/" + path, {
    method, body, cache: "no-store", redirect: "error",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(contentType ? { "Content-Type": contentType } : {}) },
    signal: AbortSignal.timeout(30000),
  });
}
async function renew(token: string): Promise<Session | null> {
  const key = createHash("sha256").update(token).digest("hex");
  const current = refreshing.get(key);
  if (current) return current;
  if (refreshing.size >= 1000) throw new Error("Refresh capacity reached");
  const task = (async () => {
    const response = await upstream("auth/refresh", "POST", JSON.stringify({ refreshToken: token }), undefined, "application/json");
    if (response.status === 401) return null;
    if (!response.ok) throw new Error("Session refresh unavailable");
    return await response.json() as Session;
  })();
  refreshing.set(key, task);
  // Coalesce requests arriving with the same old cookie after rotation.
  void task.finally(() => setTimeout(() => refreshing.delete(key), 5000)).catch(() => {});
  return task;
}

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const method = request.method;
  if (!["GET", "HEAD"].includes(method)) {
    const origin = request.headers.get("origin");
    const expectedOrigin = process.env.APP_ORIGIN ?? `${process.env.SESSION_COOKIE_SECURE === "true" ? "https:" : request.nextUrl.protocol}//${request.headers.get("host") ?? request.nextUrl.host}`;
    if (!origin || origin !== expectedOrigin) return json({ message: "مصدر الطلب غير مسموح." }, 403);
  }
  let { path: segments } = await context.params;
  let scope: string | undefined;
  if (segments[0] === "__session") {
    scope = segments[1];
    if (!scope || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scope) || segments.length < 3) return json({}, 400);
    segments = segments.slice(2);
  }
  if (segments.some(part => !part || part === "." || part === ".." || /[/\\]/.test(part))) return json({}, 400);
  const path = segments.map(encodeURIComponent).join("/");
  let access = request.cookies.get(scope ? `${ACCESS}_${scope}` : ACCESS)?.value;
  const refresh = request.cookies.get(scope ? `${REFRESH}_${scope}` : REFRESH)?.value;
  let rotated: Session | null | undefined;
  try {
    if (path === "auth/login") {
      if (method !== "POST") return json({}, 405);
      const response = await upstream(path, method, await request.text(), undefined, "application/json");
      if (!response.ok) return new NextResponse(response.body, { status: response.status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...(response.headers.get("retry-after") ? {"Retry-After": response.headers.get("retry-after")!} : {}) } });
      const session = await response.json() as Session;
      const output = json({ user: session.user, accessToken: "cookie-session", refreshToken: "" });
      writeSession(output, request, session, scope);
      return output;
    }
    if (path === "auth/logout") {
      if (method !== "POST") return json({}, 405);
      if (refresh) {
        const response = await upstream(path, "POST", JSON.stringify({ refreshToken: refresh }), undefined, "application/json");
        if (!response.ok) return json({ message: "تعذر إنهاء الجلسة. أعد المحاولة." }, 503);
      }
      const output = json({ success: true });
      writeSession(output, request, null, scope);
      return output;
    }
    if (path === "auth/refresh") return json({}, 404);
    if (path === "auth/session" && method !== "GET") return json({}, 405);
    if (!access && !refresh) return json({ message: "Authentication required" }, 401);
    const target = (path === "auth/session" ? "auth/me" : path) + request.nextUrl.search;
    const body = ["GET", "HEAD"].includes(method) ? undefined : await request.arrayBuffer();
    const contentType = request.headers.get("content-type") ?? undefined;
    let response = access ? await upstream(target, method, body, access, contentType) : new Response(null, {status:401});
    if (response.status === 401 && refresh) {
      rotated = await renew(refresh);
      if (rotated) {
        access = rotated.accessToken;
        response = await upstream(target, method, body, access, contentType);
      }
    }
    let output: NextResponse;
    if (path === "auth/session" && response.ok) {
      output = json({ user: await response.json(), accessToken: "cookie-session", refreshToken: "" });
    } else {
      const headers = new Headers({ "Cache-Control": "no-store" });
      for (const name of ["content-type", "content-disposition", "retry-after"]) {
        const value = response.headers.get(name); if (value) headers.set(name, value);
      }
      output = new NextResponse(response.body, { status: response.status, headers });
    }
    if (rotated !== undefined) writeSession(output, request, rotated, scope);
    return output;
  } catch {
    return json({ message: "تعذر الاتصال بالخادم. أعد المحاولة." }, 503);
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE, handle as HEAD };
