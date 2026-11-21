import type { ReactNode } from "react";
import type { SessionUser } from "@/lib/api";
import type { ManagerWorkspace } from "./types";
import { pages, type Page } from "./manager-navigation";
import { CompanyName, CompanyLogo } from "../platform/CompanyTheme";
import { ThemeIcon } from "../platform/ThemeIcon";
import s from "./ManagerApp.module.css";

type Props = {
  user: SessionUser;
  data: ManagerWorkspace | undefined;
  page: Page;
  title: string;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  navigate: (page: Page) => void;
  onLogout: () => Promise<void>;
  onRefresh: () => void;
  onNotifications: () => Promise<void>;
  children: ReactNode;
  overlays: ReactNode;
};

export function ManagerShell({ user, data, page, title, sidebarOpen, setSidebarOpen, navigate, onLogout, onRefresh, onNotifications, children, overlays }: Props) {
  return <div className={`${s.app} ${s.refinedManager}`}>
      {sidebarOpen && (
        <button
          className={s.sidebarBackdrop}
          aria-label="إغلاق القائمة الجانبية"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        id="manager-sidebar"
        className={`${s.sidebar} ${sidebarOpen ? s.sidebarOpen : ""}`}
      >
        <button
          className={s.sidebarToggle}
          onClick={() => setSidebarOpen(false)}
        >
          إغلاق القائمة ×
        </button>
        <div className={s.brand}>
          <span><CompanyLogo/></span>
          <div>
            <h2><CompanyName/></h2>
            <p>إدارة فرقك الميدانية</p>
          </div>
        </div>
        <nav className={s.menu} aria-label="أقسام مدير الفريق">
          {pages.map(([id, , label]) => (
            <button
              key={id}
              className={page === id ? s.active : ""}
              onClick={() => navigate(id)}
            >
              <span className={s.menuLabel}>
                <ThemeIcon name={id} size={21}/> <b>{label}</b>
              </span>
              {data && id === "team" && (
                <small className={s.count}>{data.summary.reps}</small>
              )}
              {data && id === "tours" && (
                <small className={s.count}>{data.rounds.length}</small>
              )}
              {data && id === "reports" && (
                <small className={s.count}>{data.summary.reports}</small>
              )}
              {data && id === "leaves" && (
                <small className={s.count}>{data.summary.pendingLeaves}</small>
              )}
            </button>
          ))}
        </nav>
        <div className={s.manager}>
          <div className={s.managerIdentity}>
            <span className={s.avatar}>
              {user.name
                .trim()
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0])
                .join(" ")}
            </span>
            <div>
              <b>{user.name}</b>
              <small>مدير فريق</small>
            </div>
          </div>
          <button onClick={() => void onLogout()}>تسجيل الخروج</button>
        </div>
      </aside>
      <main className={s.main}>
        <header className={s.topbar}>
          <button
            className={`${s.btn} ${s.sidebarToggle}`}
            aria-label="فتح القائمة الجانبية"
            aria-expanded={sidebarOpen}
            aria-controls="manager-sidebar"
            onClick={() => setSidebarOpen(true)}
          >
            ☰
          </button>
          <div>
            <h1>{page === "dashboard" ? "لوحة مدير الفريق" : title}</h1>
            <p>
              {data?.teams.map((t) => t.name).join("، ") ||
                "متابعة الفرق المسندة إليك"}
              {data?.cycle ? ` — ${data.cycle.name}` : ""}
            </p>
          </div>
          <div className={s.actions}>
            <button
              className={`${s.btn} ${s.secondary}`}
              onClick={onRefresh}
            >
              تحديث
            </button>
            <button
              className={`${s.btn} ${s.secondary}`}
              aria-label="الإشعارات"
              onClick={() => void onNotifications()}
            >
              🔔
            </button>
          </div>
        </header>
        <div className={s.content}>{children}</div>
      </main>
      {overlays}
    </div>;
}
