"use client";
import { createClientRef } from "@/lib/client-ref";
import { useRef, useState } from "react";
import { ApiError, request } from "@/lib/api";
import { PageHead } from "./WorkspacePages";
import { ResourceState, useResource } from "./useResource";
type Period = "WEEKLY" | "DAILY" | "CUSTOM";
type Snapshot = {
  unallocatedVisits?: number;
  from: string;
  to: string;
  today: string;
  period: Period;
  total: number;
  doctors: number;
  pharmacies: number;
  hospitals: number;
  averagePerDay: number;
  coverage: number;
  cycleName: string | null;
  workingDays: number;
};
type Report = { id: string; snapshot: Snapshot; _count: { teams: number } };
const titles = { WEEKLY: "أسبوعي", DAILY: "يومي", CUSTOM: "مخصص" };
function Preview({ data, name }: { data: Snapshot; name: string }) {
  return (
    <div className="print-report">
      <div className="print-only">
        <h1>MedREP — تقرير {titles[data.period]}</h1>
        <p>
          {name} • {data.from} — {data.to}
        </p>
      </div>
      <div className="stats-row">
        {[
          [data.doctors, "أطباء"],
          [data.pharmacies, "صيدليات"],
          [data.hospitals, "مشافي"],
        ].map(([value, label]) => (
          <div className="mini" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="list-card">
        <div className="row">
          <strong>معاينة التقرير {titles[data.period]}</strong>
          <span className="badge green">جاهز</span>
        </div>
        <p className="meta">
          {data.total} زيارة • متوسط {data.averagePerDay} يومياً • تغطية السايكل{" "}
          {data.coverage}%
        </p>
        {data.cycleName && <p className="meta">{data.cycleName}</p>}
        {Boolean(data.unallocatedVisits) && (
          <p className="meta">
            {data.unallocatedVisits} زيارات سابقة لم تُنسب إلى فرق؛ تظهر في
            تقريرك ولا تُحتسب ضمن تقارير المدراء حتى استكمال الربط.
          </p>
        )}
      </div>
      <div className="list-card">
        <div className="row">
          <strong>زيارات الفترة</strong>
          <strong>{data.total} زيارة</strong>
        </div>
        <p className="meta">
          متوسط {data.averagePerDay} زيارة يومياً خلال {data.workingDays} أيام
          عمل.
        </p>
      </div>
    </div>
  );
}
function ReportCard({
  item,
  onOpen,
}: {
  item: Report;
  onOpen: (item: Report) => void;
}) {
  return (
    <article className="list-card">
      <div className="row">
        <strong>تقرير {titles[item.snapshot.period]}</strong>
        <span className="badge green">
          {item._count.teams ? "متاح لمدراء الفرق المعنية" : "محفوظ"}
        </span>
      </div>
      <p className="meta">
        <bdi>
          {item.snapshot.from} — {item.snapshot.to}
        </bdi>
      </p>
      <p className="meta">
        {item.snapshot.total} زيارة • تغطية {item.snapshot.coverage}%
      </p>
      <button className="secondary full" onClick={() => onOpen(item)}>
        عرض التقرير
      </button>
    </article>
  );
}
export function Reports({
  token,
  name,
  history = false,
  onBack,
  onHistory,
}: {
  token: string;
  name: string;
  history?: boolean;
  onBack: () => void;
  onHistory: () => void;
}) {
  const [period, setPeriod] = useState<Period>("WEEKLY");
  const [range, setRange] = useState({ from: "", to: "" });
  const [opened, setOpened] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<{
    clientRef: string;
    period: Period;
    from: string;
    to: string;
  } | null>(null);
  const lock = useRef(false);
  const query = new URLSearchParams({
    period,
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
  });
  const preview = useResource<Snapshot>(`/rep/reports/preview?${query}`, token);
  const reports = useResource<{ items: Report[] }>("/rep/reports", token);
  async function save() {
    if (lock.current || !preview.data) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    pending.current ??= {
      clientRef: createClientRef(),
      period,
      from: preview.data.from,
      to: preview.data.to,
    };
    try {
      const result = await request<{ teamCount: number }>(
        "/rep/reports",
        token,
        { method: "POST", body: JSON.stringify(pending.current) },
      );
      setMessage(
        result.teamCount
          ? "تم حفظ التقرير وإتاحته لمدراء الفرق المعنية حسب نطاق كل فريق."
          : "تم حفظ التقرير. لا توجد فرق مسندة في هذه الفترة لإرسال التقرير إلى مدير.",
      );
      pending.current = null;
      setUncertain(false);
      reports.reload();
    } catch (err) {
      const known =
        err instanceof ApiError && err.status >= 400 && err.status < 500;
      if (known) pending.current = null;
      setUncertain(!known);
      setMessage(err instanceof Error ? err.message : "تعذر الحفظ.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (opened)
    return (
      <section className="screen">
        <PageHead
          title={`تقرير ${titles[opened.snapshot.period]}`}
          onBack={() => setOpened(null)}
        />
        <p className="meta">
          <bdi>
            {opened.snapshot.from} — {opened.snapshot.to}
          </bdi>
        </p>
        <Preview data={opened.snapshot} name={name} />
        <button className="secondary full" onClick={() => window.print()}>
          تنزيل PDF
        </button>
      </section>
    );
  if (history)
    return (
      <section className="screen">
        <PageHead title="سجل التقارير" onBack={onBack} />
        {!reports.data ? (
          <ResourceState error={reports.error} retry={reports.reload} />
        ) : reports.data.items.length ? (
          reports.data.items.map((item) => (
            <ReportCard key={item.id} item={item} onOpen={setOpened} />
          ))
        ) : (
          <p className="empty">لا توجد تقارير محفوظة.</p>
        )}
      </section>
    );
  return (
    <section className="screen">
      <PageHead title="التقارير" onBack={onBack} />
      <fieldset disabled={busy || uncertain}>
        <div className="tabs">
          {(Object.keys(titles) as Period[]).map((p) => (
            <button
              key={p}
              className={`tab ${p === period ? "active" : ""}`}
              onClick={() => {
                setPeriod(p);
                setRange({ from: "", to: "" });
                setMessage("");
              }}
            >
              {titles[p]}
            </button>
          ))}
        </div>
        <div className="list-card date-pair">
          <label className="meta">
            من تاريخ
            <input
              className="field"
              type="date"
              max={preview.data?.today}
              value={range.from || preview.data?.from || ""}
              onChange={(e) =>
                setRange({
                  from: e.target.value,
                  to:
                    period === "DAILY"
                      ? e.target.value
                      : range.to || preview.data?.to || "",
                })
              }
            />
          </label>
          <label className="meta">
            إلى تاريخ
            <input
              className="field"
              type="date"
              max={preview.data?.today}
              value={range.to || preview.data?.to || ""}
              onChange={(e) =>
                setRange({
                  from:
                    period === "DAILY"
                      ? e.target.value
                      : range.from || preview.data?.from || "",
                  to: e.target.value,
                })
              }
            />
          </label>
        </div>
      </fieldset>
      {preview.data ? (
        <Preview data={preview.data} name={name} />
      ) : (
        <ResourceState error={preview.error} retry={preview.reload} />
      )}
      <div className="dual-actions">
        <button
          className="secondary"
          disabled={!preview.data}
          onClick={() => window.print()}
        >
          تنزيل PDF
        </button>
        <button
          className="primary"
          disabled={busy || !preview.data}
          onClick={save}
        >
          {busy
            ? "جارِ الحفظ…"
            : uncertain
              ? "إعادة محاولة الحفظ"
              : "حفظ وإرسال للمدير"}
        </button>
      </div>
      {message && (
        <p className="status-message" role="status">
          {message}
        </p>
      )}
      <div className="section-title">
        <h3>آخر التقارير المحفوظة</h3>
        <button onClick={onHistory}>عرض السجل</button>
      </div>
      {reports.data ? (
        reports.data.items.length ? (
          reports.data.items
            .slice(0, 3)
            .map((item) => (
              <ReportCard item={item} key={item.id} onOpen={setOpened} />
            ))
        ) : (
          <p className="empty">لا توجد تقارير محفوظة.</p>
        )
      ) : (
        <ResourceState error={reports.error} retry={reports.reload} />
      )}
    </section>
  );
}
