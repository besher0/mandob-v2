"use client";
import { useState } from "react";
import { useViewState } from "@/lib/view-state";
import type { SessionUser } from "@/lib/api";
import { CompanyLogo, CompanyName } from "../platform/CompanyTheme";
import { ThemeIcon } from "../platform/ThemeIcon";
import { SalesWorkspace } from "./SalesWorkspace";
import s from "./Sales.module.css";
import ui from "../manager/ManagerApp.module.css";

export function SalesApp({
  token,
  user,
  onLogout,
}: {
  token: string;
  user: SessionUser;
  onLogout: () => Promise<void>;
}) {
  const [page, setPage] = useViewState<"visits" | "orders">(
    "sales:sidebar-page",
    "visits",
  );
  const [open, setOpen] = useState(false);
  function navigate(next: "visits" | "orders") {
    setPage(next);
    setOpen(false);
  }
  return (
    <main className={ui.app}>
      {open && (
        <button
          className={ui.sidebarBackdrop}
          aria-label="إغلاق القائمة"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="sales-navigation"
        className={`${ui.sidebar} ${open ? ui.sidebarOpen : ""}`}
      >
        <button className={ui.sidebarToggle} onClick={() => setOpen(false)}>
          إغلاق القائمة
        </button>
        <div className={ui.brand}>
          <span>
            <CompanyLogo />
          </span>
          <div>
            <h2>
              <CompanyName />
            </h2>
            <p>إدارة المبيعات</p>
          </div>
        </div>
        <nav className={ui.menu} aria-label="أقسام مدير المبيعات">
          <button
            className={page === "visits" ? ui.active : ""}
            aria-current={page === "visits" ? "page" : undefined}
            onClick={() => navigate("visits")}
          >
            <span className={ui.menuLabel}>
              <ThemeIcon name="areas" />
              <b>زياراتي</b>
            </span>
          </button>
          <button
            className={page === "orders" ? ui.active : ""}
            aria-current={page === "orders" ? "page" : undefined}
            onClick={() => navigate("orders")}
          >
            <span className={ui.menuLabel}>
              <ThemeIcon name="target" />
              <b>المبيعات</b>
            </span>
          </button>
        </nav>
        <div className={s.sidebarInfo}>
          <strong>{user.name}</strong>
          <p>مدير المبيعات</p>
        </div>
        <button className={s.button} onClick={() => void onLogout()}>
          تسجيل الخروج
        </button>
      </aside>
      <div className={ui.main}>
        <header className={ui.topbar}>
          <button
            className={ui.sidebarToggle}
            aria-expanded={open}
            aria-controls="sales-navigation"
            onClick={() => setOpen(true)}
          >
            القائمة
          </button>
          <div>
            <h1>{page === "orders" ? "المبيعات" : "زياراتي"}</h1>
            <p>{user.name} — مدير المبيعات</p>
          </div>
        </header>
        <div className={ui.content}>
          <SalesWorkspace
            key={page}
            token={token}
            activePage={page}
            onPageChange={navigate}
          />
        </div>
      </div>
    </main>
  );
}
