"use client";
import { createClientRef } from "@/lib/client-ref";
import { FormEvent, useRef, useState } from "react";
import { browserApiBase, ApiError, request } from "@/lib/api";
import { PageHead } from "./WorkspacePages";
import { ResourceState, useResource } from "./useResource";
const types: Record<string, string> = {
  ANNUAL: "سنوية",
  SICK: "مرضية",
  EMERGENCY: "إسعافية",
  UNPAID: "بدون أجر",
};
const statuses: Record<string, string> = {
  PENDING: "قيد المراجعة",
  APPROVED: "مقبولة",
  REJECTED: "مرفوضة",
  CANCELLED: "ملغاة",
};
type LeaveData = {
  today: string;
  balance: number;
  year: number;
  approver: { id: string; name: string } | null;
  items: {
    id: string;
    type: string | null;
    startsOn: string;
    endsOn: string;
    requestedDays: number;
    reason: string | null;
    reviewNote: string | null;
    status: string;
    approver: { id: string; name: string } | null;
    attachment: { id: string; name: string } | null;
  }[];
};
export function Leaves({
  token,
  onBack,
}: {
  token: string;
  onBack: () => void;
}) {
  const resource = useResource<LeaveData>("/rep/leaves", token, 15000);
  const [type, setType] = useState("ANNUAL"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [message, setMessage] = useState("");
  const file = useRef<HTMLInputElement>(null),
    pending = useRef<FormData | null>(null),
    lock = useRef(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    setMessage("");
    const attachment = file.current?.files?.[0];
    if (attachment && attachment.size > 2 * 1024 * 1024) {
      setMessage("حجم المرفق يجب ألا يتجاوز 2 ميغابايت.");
      return;
    }
    if (!pending.current) {
      const data = new FormData();
      data.set("clientRef", createClientRef());
      data.set("type", type);
      data.set("from", from);
      data.set("to", to);
      data.set("reason", reason);
      if (attachment) data.set("attachment", attachment);
      pending.current = data;
    }
    lock.current = true;
    setBusy(true);
    try {
      const result = await request<{ routed: boolean }>("/rep/leaves", token, {
        method: "POST",
        body: pending.current,
      });
      setMessage(
        result.routed
          ? "تم إرسال طلب الإجازة للمدير، بانتظار المراجعة."
          : "تم حفظ طلب الإجازة بانتظار تحديد جهة الموافقة من الإدارة.",
      );
      pending.current = null;
      setUncertain(false);
      setFrom("");
      setTo("");
      setReason("");
      if (file.current) file.current.value = "";
      resource.reload();
    } catch (err) {
      const known =
        err instanceof ApiError && err.status >= 400 && err.status < 500;
      if (known) pending.current = null;
      setUncertain(!known);
      setMessage(err instanceof Error ? err.message : "تعذر إرسال الطلب.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function download(id: string, name: string) {
    try {
      const response = await fetch(`${browserApiBase()}/rep/leave-attachments/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("تعذر تنزيل المرفق.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "تعذر تنزيل المرفق.");
    }
  }
  return (
    <section className="screen">
      <PageHead title="طلب إجازة" onBack={onBack} />
      {!resource.data ? (
        <ResourceState error={resource.error} retry={resource.reload} />
      ) : (
        <>
          <form className="list-card" onSubmit={save}>
            <fieldset disabled={busy || uncertain}>
              <label className="meta">
                نوع الإجازة
                <select
                  className="field"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                >
                  {Object.entries(types).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="date-pair">
                <label className="meta">
                  من تاريخ
                  <input
                    className="field"
                    type="date"
                    required
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="meta">
                  إلى تاريخ
                  <input
                    className="field"
                    type="date"
                    required
                    min={from}
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
              </div>
              <label className="meta">
                السبب أو الملاحظة
                <textarea
                  className="field"
                  rows={4}
                  maxLength={4000}
                  placeholder="اكتب ملاحظة مختصرة للمدير"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label className="meta">
                مرفق اختياري
                <input
                  className="field"
                  type="file"
                  ref={file}
                  accept="application/pdf,image/png,image/jpeg"
                />
              </label>
              <p className="meta">PDF أو صورة، حتى 2 ميغابايت.</p>
            </fieldset>
            <div className="leave-balance">
              <span>رصيد الإجازة السنوية — {resource.data.year}</span>
              <strong>{resource.data.balance} يوم</strong>
            </div>
            {resource.data.approver ? (
              <p className="meta">
                مدير الموافقة: {resource.data.approver.name}
              </p>
            ) : (
              <p className="meta">
                لم تُحدد جهة الموافقة بعد؛ سيبقى الطلب بانتظار إعدادها من
                الإدارة.
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy
                ? "جارِ الإرسال…"
                : uncertain
                  ? "إعادة محاولة الإرسال"
                  : "إرسال الطلب للمدير"}
            </button>
          </form>
          <div className="section-title">
            <h3>طلباتي السابقة</h3>
          </div>
          {resource.data.items.map((l) => (
            <article className="list-card" key={l.id}>
              <div className="row">
                <strong>
                  إجازة {l.type ? types[l.type] : "غير محددة النوع"}
                </strong>
                <span
                  className={`badge ${l.status === "APPROVED" ? "green" : l.status === "REJECTED" ? "red" : ""}`}
                >
                  {statuses[l.status]}
                </span>
              </div>
              <p className="meta">
                <bdi>
                  {l.startsOn.slice(0, 10)} — {l.endsOn.slice(0, 10)}
                </bdi>{" "}
                • {l.requestedDays} يوم
              </p>
              {l.reason && <p>{l.reason}</p>}
              {l.reviewNote && <p className="company-note">{l.reviewNote}</p>}
              {l.attachment && (
                <button
                  className="secondary full"
                  onClick={() =>
                    void download(l.attachment!.id, l.attachment!.name)
                  }
                >
                  تنزيل المرفق: {l.attachment.name}
                </button>
              )}
            </article>
          ))}
          {!resource.data.items.length && (
            <p className="empty">لا توجد طلبات سابقة.</p>
          )}
        </>
      )}
      {message && (
        <p className="status-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
