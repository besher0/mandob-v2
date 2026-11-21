"use client";
import s from "./ManagerApp.module.css";
import type { ManagerLeave } from "./types";
import { useRef, useState } from "react";
import { browserApiBase, request } from "@/lib/api";
import { useResource } from "../rep/useResource";
import { Empty } from "./TablePrimitives";
import { Load } from "./Load";

export function LeaveList({
  token,
  onChanged,
}: {
  token: string;
  onChanged: () => void;
}) {
  const resource = useResource<{ items: ManagerLeave[] }>(
    "/manager/leaves",
    token,
    15000,
  );
  const [busy, setBusy] = useState(""),
    [message, setMessage] = useState("");
  const lock = useRef(false);
  async function decide(id: string, status: "APPROVED" | "REJECTED") {
    if (lock.current) return;
    lock.current = true;
    setBusy(id);
    setMessage("");
    try {
      await request(`/manager/leaves/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setMessage(
        status === "APPROVED"
          ? "تم قبول طلب الإجازة وإشعار المندوب."
          : "تم رفض طلب الإجازة وإشعار المندوب.",
      );
      resource.reload();
      onChanged();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "تعذر تسجيل القرار.");
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  async function download(a: { id: string; name: string }) {
    try {
      const response = await fetch(
        `${browserApiBase()}/rep/leave-attachments/${a.id}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (!response.ok) throw new Error("تعذر تنزيل المرفق.");
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = a.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "تعذر التنزيل.");
    }
  }
  return (
    <>
      {message && (
        <p className={s.notice} role="status">
          {message}
        </p>
      )}
      {!resource.data ? (
        <Load error={resource.error} retry={resource.reload} />
      ) : resource.data.items.length ? (
        <div className={s.list}>
          {resource.data.items.map((l) => (
            <article className={s.card} key={l.id}>
              <div className={s.row}>
                <strong>{l.requester.name}</strong>
                <span
                  className={`${s.badge} ${l.status === "REJECTED" ? s.danger : l.status === "PENDING" ? s.warning : ""}`}
                >
                  {
                    (
                      {
                        PENDING: "بانتظار المراجعة",
                        APPROVED: "مقبولة",
                        REJECTED: "مرفوضة",
                        CANCELLED: "ملغاة",
                      } as Record<string, string>
                    )[l.status]
                  }
                </span>
              </div>
              <p className={s.muted}>
                {(
                  {
                    ANNUAL: "سنوية",
                    SICK: "مرضية",
                    EMERGENCY: "إسعافية",
                    UNPAID: "بدون أجر",
                  } as Record<string, string>
                )[l.type ?? ""] ?? "نوع غير محدد"}{" "}
                •{" "}
                <bdi>
                  {l.startsOn.slice(0, 10)} — {l.endsOn.slice(0, 10)}
                </bdi>{" "}
                • {l.requestedDays} يوم
              </p>
              {l.reason && <p>{l.reason}</p>}
              {l.reviewNote && <p className={s.notice}>{l.reviewNote}</p>}
              <div className={s.actions}>
                {l.attachment && (
                  <button
                    className={`${s.btn} ${s.secondary}`}
                    onClick={() => void download(l.attachment!)}
                  >
                    تنزيل المرفق
                  </button>
                )}
                {l.status === "PENDING" && (
                  <>
                    <button
                      className={s.btn}
                      disabled={Boolean(busy)}
                      onClick={() => void decide(l.id, "APPROVED")}
                    >
                      {busy === l.id ? "جارِ الحفظ…" : "قبول"}
                    </button>
                    <button
                      className={`${s.btn} ${s.danger}`}
                      disabled={Boolean(busy)}
                      onClick={() => void decide(l.id, "REJECTED")}
                    >
                      رفض
                    </button>
                  </>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty>لا توجد طلبات إجازة موجهة إليك.</Empty>
      )}
    </>
  );
}
