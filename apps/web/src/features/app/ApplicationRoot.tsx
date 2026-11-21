"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiError,
  Dashboard,
  login,
  request,
  Session,
  SessionUser,
  Workspace,
} from "@/lib/api";
import { LoginView } from "@/features/auth/LoginView";
import { ManagerApp } from "@/features/manager/ManagerApp";
import { isManagerWorkspace } from "@/features/manager/types";
import { RepApp } from "@/features/rep/RepApp";

import { SalesApp } from "@/features/sales/SalesApp";
import { CompanyStaffApp } from '@/features/company/CompanyStaffApp';
import { CompanyApp } from "@/features/company/CompanyApp";
import { PlatformApp } from "@/features/platform/PlatformApp";
import { ViewStateProvider } from "@/lib/view-state";
import { CompanyTheme } from "@/features/platform/CompanyTheme";
const isSales = (user: SessionUser) => user.roles.includes("SALES_MANAGER");
const isPlatform = (user: SessionUser) => user.roles.includes("SUPER_ADMIN");
const isCompany = (user: SessionUser) => user.roles.includes("NATIONAL_MANAGER") || user.roles.includes("COMPANY_STAFF");
const SESSION_KEY = "medrep_session";
export default function ApplicationRoot() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<{
    workspace: Workspace;
    dashboard: Dashboard;
  } | null>(null);
  const refreshVersion = useRef(0);
  const refresh = useCallback(async (token: string, signal?: AbortSignal) => {
    const version = ++refreshVersion.current;
    const [workspace, dashboard] = await Promise.all([
      request<Workspace>("/rep/workspace", token, { signal }),
      request<Dashboard>("/rep/dashboard", token, { signal }),
    ]);
    if (!signal?.aborted && version === refreshVersion.current)
      setData({ workspace, dashboard });
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        // Legacy browser-readable credentials are intentionally not migrated.
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem("medrep_access_token");
        localStorage.removeItem("medrep_user");
        const restored = await request<Session>("/auth/session");
        if (cancelled) return;
        setSession(restored);
        if (!isSales(restored.user) && !isPlatform(restored.user) && !isCompany(restored.user) && !isManagerWorkspace(restored.user))
          await refresh(restored.accessToken);
      } catch (err) {
        if (!cancelled) {
          if (!(err instanceof ApiError && err.status === 401))
            setError(err instanceof Error ? err.message : "تعذر استعادة الجلسة.");
          if (err instanceof ApiError && err.status === 401)
            localStorage.removeItem(SESSION_KEY);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void restore();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    if (!session || isSales(session.user) || isPlatform(session.user) || isCompany(session.user) || isManagerWorkspace(session.user)) return;
    const controller = new AbortController();
    let pending = false;
    const refreshVisible = async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        await refresh(session.accessToken, controller.signal);
      } catch {
        // Keep the last successful data and the representative's in-progress form.
      } finally {
        pending = false;
      }
    };
    const timer = window.setInterval(refreshVisible, 15000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [session, refresh]);

  async function signIn(username: string, password: string) {
    setLoading(true);
    setError("");
    try {
      const result = await login(username, password);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem("medrep_access_token");
      localStorage.removeItem("medrep_user");
      setSession(result);
      if (!isSales(result.user) && !isPlatform(result.user) && !isCompany(result.user) && !isManagerWorkspace(result.user)) await refresh(result.accessToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تسجيل الدخول.");
    } finally {
      setLoading(false);
    }
  }
  async function signOut() {
    ++refreshVersion.current;
    try {
      await request("/auth/logout", undefined, { method: "POST" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر تسجيل الخروج.");
      return;
    }
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem("medrep_access_token");
    localStorage.removeItem("medrep_user");
    setSession(null);
    setData(null);
    setError("");
  }
  if (!ready)
    return (
      <main className="login-page" role="status">
        جارِ التحميل…
      </main>
    );
  if (!session)
    return <LoginView loading={loading} error={error} onLogin={signIn} />;
  if (isPlatform(session.user)) return <ViewStateProvider scope={`platform:${session.user.id}`}><PlatformApp token={session.accessToken} onLogout={signOut}/></ViewStateProvider>;
  if (session.user.roles.includes("NATIONAL_MANAGER")) return <ViewStateProvider scope={`${session.user.organizationId}:${session.user.id}`}><CompanyTheme key={session.user.organizationId} token={session.accessToken}><CompanyApp token={session.accessToken} user={session.user} onLogout={signOut}/></CompanyTheme></ViewStateProvider>;
  if (isSales(session.user)) return <ViewStateProvider scope={`${session.user.organizationId}:${session.user.id}`}><CompanyTheme key={session.user.organizationId} token={session.accessToken}><SalesApp token={session.accessToken} user={session.user} onLogout={signOut}/></CompanyTheme></ViewStateProvider>;
  if (session.user.roles.includes("COMPANY_STAFF")) return <ViewStateProvider scope={`${session.user.organizationId}:${session.user.id}`}><CompanyTheme key={session.user.organizationId} token={session.accessToken}><CompanyStaffApp token={session.accessToken} user={session.user} onLogout={signOut}/></CompanyTheme></ViewStateProvider>;
  if (isManagerWorkspace(session.user))
    return (
      <ViewStateProvider scope={`${session.user.organizationId}:${session.user.id}`}><CompanyTheme key={session.user.organizationId} token={session.accessToken}><ManagerApp
        user={session.user}
        token={session.accessToken}
        onLogout={signOut}
      /></CompanyTheme></ViewStateProvider>
    );
  if (!data)
    return (
      <main className="login-page">
        <div className="login-card">
          <p role="alert">{error || "جارِ تحميل بياناتك…"}</p>
          <button
            className="primary"
            onClick={() => {
              setError("");
              void refresh(session.accessToken).catch((err) =>
                setError(err.message),
              );
            }}
          >
            إعادة المحاولة
          </button>
          <button className="back" onClick={signOut}>
            تسجيل الخروج
          </button>
        </div>
      </main>
    );
  return (
    <ViewStateProvider scope={`${session.user.organizationId}:${session.user.id}`}><CompanyTheme key={session.user.organizationId} token={session.accessToken}><RepApp
      user={session.user}
      token={session.accessToken}
      workspace={data.workspace}
      dashboard={data.dashboard}
      onRefresh={() => refresh(session.accessToken)}
      onLogout={signOut}
    /></CompanyTheme></ViewStateProvider>
  );
}
