"use client";
import { useState } from "react";
import { useViewState } from "@/lib/view-state";
import { SalesEntry } from "./SalesEntry";
import { SalesOrders, SalesVisits } from "./SalesRecords";
import { SalesSetup } from "./SalesSetup";
import type { SalesVisit } from "./types";
import s from "./Sales.module.css";
import ui from "../manager/ManagerApp.module.css";

export function SalesWorkspace({
  token,
  review = false,
  activePage,
  onPageChange,
}: {
  token: string;
  review?: boolean;
  activePage?: "visits" | "orders";
  onPageChange?: (page: "visits" | "orders") => void;
}) {
  const [storedPage, setStoredPage] = useViewState<
    "visits" | "orders" | "setup"
  >("sales:page", "visits");
  const page = activePage ?? storedPage;
  function setPage(next: "visits" | "orders" | "setup") {
    if (onPageChange && next !== "setup") onPageChange(next);
    else setStoredPage(next);
  }
  const [entry, setEntry] = useState<{
    order: boolean;
    visit?: SalesVisit;
  } | null>(null);
  const [version, setVersion] = useState(0),
    [message, setMessage] = useState("");
  return (
    <div className={s.workspace}>
      <div className={review ? s.toolbar : s.hiddenToolbar}>
        {review && (
          <div className={s.tabs} aria-label="أقسام المبيعات">
            <button
              aria-pressed={page === "visits"}
              onClick={() => {
                setPage("visits");
                setEntry(null);
                setMessage("");
              }}
            >
              الزيارات
            </button>
            <button
              aria-pressed={page === "orders"}
              onClick={() => {
                setPage("orders");
                setEntry(null);
                setMessage("");
              }}
            >
              {review ? "طلبات البيع" : "طلباتي"}
            </button>
            {review && (
              <button
                aria-pressed={page === "setup"}
                onClick={() => setPage("setup")}
              >
                مدراء المبيعات والوكلاء
              </button>
            )}
          </div>
        )}
      </div>
      {!entry && (
        <div className={s.pageHeading}>
          <div>
            <h2>
              {page === "setup" && review
                ? "إدارة المبيعات"
                : page === "orders"
                  ? "طلبات البيع"
                  : "سجل الزيارات"}
            </h2>
            <p>
              {page === "setup"
                ? "حسابات مدراء المبيعات ووكلاء المحافظات."
                : page === "orders"
                  ? "تابع الأصناف والعروض وقرار المدير العام لكل طلب."
                  : "الزيارات المسجلة للصيدليات والمشافي."}
            </p>
          </div>
          {!review && (
            <button
              className={s.primaryButton}
              onClick={() => {
                setEntry({ order: page === "orders" });
                setMessage("");
              }}
            >
              {page === "orders" ? "+ إضافة طلب بيع" : "+ إضافة زيارة"}
            </button>
          )}
        </div>
      )}
      {page === "orders" && !entry && (
        <p className={s.hint}>الموافقة على الطلب لا تعني تنفيذ البيع.</p>
      )}
      {message && (
        <p role="status" className={ui.notice}>
          {message}
        </p>
      )}
      {entry ? (
        <SalesEntry
          key={`${entry.order}:${entry.visit?.id ?? ""}`}
          token={token}
          {...entry}
          onCancel={() => setEntry(null)}
          onSaved={() => {
            setPage(entry.order ? "orders" : "visits");
            setMessage(
              entry.order
                ? "تم إرسال الطلب للمدير العام."
                : "تم تسجيل الزيارة.",
            );
            setEntry(null);
            setVersion((v) => v + 1);
          }}
        />
      ) : page === "setup" && review ? (
        <SalesSetup token={token} />
      ) : page === "orders" ? (
        <SalesOrders key={version} token={token} review={review} />
      ) : (
        <SalesVisits
          key={version}
          token={token}
          review={review}
          onOrder={(visit) => {
            setEntry({ order: true, visit });
            setMessage("");
          }}
        />
      )}
    </div>
  );
}
