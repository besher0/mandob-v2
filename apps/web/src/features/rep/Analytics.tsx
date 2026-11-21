"use client";
import { useState } from "react";
import type { Target, Workspace } from "@/lib/api";
import { TargetCard } from "./TargetList";
import { PageHead } from "./WorkspacePages";
import { ResourceState, useResource } from "./useResource";
const sections = [
  {
    id: "frequency",
    title: "Frequency",
    detail: "تحليل Frequency",
    icon: "🔁",
    description: "الملتزم والمتأخر حسب عدد الزيارات",
  },
  {
    id: "unvisited",
    title: "غير مزار",
    detail: "الأطباء غير المزارين",
    icon: "⚠️",
    description: "الأطباء غير المزارين حسب المنطقة والتقييم",
  },
  {
    id: "coverage",
    title: "تغطية المناطق",
    detail: "تغطية المناطق",
    icon: "📍",
    description: "مقارنة المناطق حسب نسبة التغطية",
  },
  {
    id: "aDoctors",
    title: "أطباء A",
    detail: "تحليل أطباء A",
    icon: "⭐",
    description: "متابعة الأولويات الأعلى",
  },
  {
    id: "products",
    title: "أداء الأصناف",
    detail: "أداء الأصناف",
    icon: "💊",
    description: "عدد مرات الترويج حسب الصنف",
  },
  {
    id: "cycles",
    title: "مقارنة السايكلات",
    detail: "مقارنة السايكلات",
    icon: "📈",
    description: "الحالي مقابل السايكل السابق",
  },
] as const;
type Kind = (typeof sections)[number]["id"];
type Kpi = { label: string; value: string | number };
type AnalyticsData = {
  current: null | {
    cycle: { id: string; name: string };
    range: { from: string; to: string };
    kpis: Record<Exclude<Kind, "cycles">, Kpi[]>;
    doctors: Target[];
    needsVisit: Target[];
    aDoctors: Target[];
    summary: {
      total: number;
      complete: number;
      behind: number;
      unvisited: number;
    };
    areas: {
      id: string;
      name: string;
      total: number;
      unvisited: number;
      aCount: number;
      coverage: number;
    }[];
    products: {
      id: string;
      name: string;
      guidance: string | null;
      count: number;
      target: number | null;
    }[];
  };
  previous: null | {
    cycle: { id: string; name: string };
    range: { from: string; to: string };
  };
  overview: null | {
    compliance: number;
    unvisited: number;
    unvisitedA: number;
    areaCoverage: number;
  };
  comparison: {
    key: string;
    label: string;
    unit: string;
    current: number;
    previous: number;
    delta: number;
    improved: boolean;
  }[];
};
const freshFilters = () => ({ period: "cycle", areaId: "", classId: "" });
function Kpis({ items }: { items: Kpi[] }) {
  return (
    <div className="stats-row">
      {items.map((item) => (
        <div className="mini" key={item.label}>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
function Doctors({ items }: { items: Target[] }) {
  return items.length ? (
    items.map((t) => (
      <TargetCard
        key={t.id}
        target={t}
        visitsLabel="زيارات الفترة"
        lastVisitLabel="آخر زيارة ضمن الفترة"
      />
    ))
  ) : (
    <p className="empty">لا توجد نتائج ضمن الفلاتر المحددة.</p>
  );
}
export function Analytics({
  token,
  workspace,
  onBack,
}: {
  token: string;
  workspace: Workspace;
  onBack: () => void;
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [filters, setFilters] = useState(freshFilters);
  const selected = kind ? filters : freshFilters();
  const params = new URLSearchParams({
    period: selected.period,
    ...(selected.areaId ? { areaId: selected.areaId } : {}),
    ...(selected.classId ? { classId: selected.classId } : {}),
  });
  const resource = useResource<AnalyticsData>(
    `/rep/analytics?${params}`,
    token,
  );
  const data = resource.data;
  const current = data?.current;
  const title = sections.find((s) => s.id === kind)?.detail ?? "التحليل";
  function open(next: Kind | null) {
    setKind(next);
    window.scrollTo({ top: 0 });
  }
  return (
    <section className="screen">
      <PageHead title={title} onBack={() => (kind ? open(null) : onBack())} />
      {kind && (
        <div className="list-card">
          <div className="row">
            <div>
              <strong>فلاتر التحليل</strong>
              <div className="meta">عدّل الفترة والمنطقة والتقييم</div>
            </div>
            <button
              className="secondary"
              onClick={() => setFilters(freshFilters())}
            >
              إعادة ضبط
            </button>
          </div>
          <div className="date-pair">
            <select
              className="field"
              aria-label="فترة التحليل"
              value={filters.period}
              onChange={(e) =>
                setFilters((f) => ({ ...f, period: e.target.value }))
              }
            >
              <option value="cycle">السايكل الحالي</option>
              <option value="week">هذا الأسبوع</option>
              <option value="month">هذا الشهر</option>
            </select>
            <select
              className="field"
              aria-label="منطقة التحليل"
              value={filters.areaId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, areaId: e.target.value }))
              }
            >
              <option value="">كل المناطق</option>
              {workspace.areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-options">
            <button
              className={`chip ${!filters.classId ? "selected" : ""}`}
              aria-pressed={!filters.classId}
              onClick={() => setFilters((f) => ({ ...f, classId: "" }))}
            >
              الكل
            </button>
            {workspace.classes.map((c) => (
              <button
                key={c.id}
                className={`chip ${filters.classId === c.id ? "selected" : ""}`}
                aria-pressed={filters.classId === c.id}
                onClick={() => setFilters((f) => ({ ...f, classId: c.id }))}
              >
                {c.code}
              </button>
            ))}
          </div>
        </div>
      )}
      {!data ? (
        <ResourceState error={resource.error} retry={resource.reload} />
      ) : !current || !data.overview ? (
        <p className="empty">لا يوجد سايكل فعال مسند إليك.</p>
      ) : !kind ? (
        <>
          <div className="hero">
            <p>ملخص السايكل الحالي</p>
            <h2>{current.cycle.name}</h2>
            <div className="hero-row">
              {[
                [`${data.overview.compliance}%`, "التزام Frequency"],
                [data.overview.unvisited, "طبيب غير مزار"],
                [`${data.overview.areaCoverage}%`, "تغطية المناطق"],
                [data.overview.unvisitedA, "أطباء A غير مزارين"],
              ].map(([value, label]) => (
                <div className="hero-stat" key={label}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="section-title">
            <h3>اختر نوع التحليل</h3>
            <span className="meta">اضغط لعرض التفاصيل</span>
          </div>
          <div className="analysis-grid">
            {sections.map((s) => (
              <button
                className="action-card"
                key={s.id}
                onClick={() => open(s.id)}
              >
                <span>{s.icon}</span>
                <strong>{s.title}</strong>
                <small>{s.description}</small>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="print-report">
            <div className="print-only">
              <h1>{title}</h1>
              <p>{current.cycle.name}</p>
            </div>
            <p className="meta analysis-period">
              <bdi>
                {current.range.from} — {current.range.to}
              </bdi>
              {filters.period !== "cycle" &&
                " • زيارات الفترة المحددة، مقارنة بأهداف السايكل دون تغييرها."}
            </p>
            {kind !== "cycles" && <Kpis items={current.kpis[kind]} />}
            {kind === "frequency" && (
              <>
                <div className="list-card">
                  <div className="row">
                    <strong>توزيع الالتزام</strong>
                    <span className="badge">{current.summary.total} طبيب</span>
                  </div>
                  {(
                    [
                      ["مكتمل", current.summary.complete],
                      ["ناقص زيارة أو أكثر", current.summary.behind],
                      ["غير مزار", current.summary.unvisited],
                    ] as const
                  ).map(([label, count]) => (
                    <div className="analysis-distribution" key={label}>
                      <div className="row">
                        <span>{label}</span>
                        <strong>{count}</strong>
                      </div>
                      <progress
                        aria-label={label}
                        value={count}
                        max={current.summary.total || 1}
                      />
                    </div>
                  ))}
                </div>
                <Doctors items={current.doctors} />
              </>
            )}
            {kind === "unvisited" && (
              <>
                {current.needsVisit.length > 0 && (
                  <div className="notice">
                    <div className="dot danger" />
                    <div>
                      <strong>الأولوية لأطباء A</strong>
                      <p>
                        ابدأ بالمناطق التي تحتوي أعلى عدد من أطباء A غير
                        المكتملين.
                      </p>
                    </div>
                  </div>
                )}
                <Doctors items={current.needsVisit} />
              </>
            )}
            {kind === "aDoctors" && <Doctors items={current.aDoctors} />}
            {kind === "coverage" &&
              (current.areas.length ? (
                current.areas.map((a) => (
                  <article className="list-card" key={a.id}>
                    <div className="row">
                      <strong>{a.name}</strong>
                      <span
                        className={`badge ${a.coverage < 50 ? "red" : "green"}`}
                      >
                        {a.coverage}%
                      </span>
                    </div>
                    <p className="meta">
                      {a.total} طبيب • {a.unvisited} غير مزار • {a.aCount} أطباء
                      A
                    </p>
                    <progress
                      value={a.coverage}
                      max={100}
                      aria-label={`تغطية ${a.name}`}
                    />
                  </article>
                ))
              ) : (
                <p className="empty">لا توجد مناطق مطابقة.</p>
              ))}
            {kind === "products" &&
              (current.products.length ? (
                current.products.map((p) => (
                  <article className="list-card" key={p.id}>
                    <div className="row">
                      <div>
                        <strong>{p.name}</strong>
                        {p.guidance && <div className="meta">{p.guidance}</div>}
                      </div>
                      <span className="badge">{p.count} مرة</span>
                    </div>
                    <p className="meta">المستهدف: {p.target ?? "غير محدد"}</p>
                  </article>
                ))
              ) : (
                <p className="empty">لا توجد أصناف مسندة إليك.</p>
              ))}
            {kind === "cycles" &&
              (data.previous ? (
                <>
                  <p className="meta">
                    {current.cycle.name} مقابل {data.previous.cycle.name}
                  </p>
                  <p className="meta">
                    فترة المقارنة السابقة:{" "}
                    <bdi>
                      {data.previous.range.from} — {data.previous.range.to}
                    </bdi>
                  </p>
                  <div className="analysis-table-wrap">
                    <table className="analysis-table">
                      <thead>
                        <tr>
                          <th>المؤشر</th>
                          <th>الحالي</th>
                          <th>السابق</th>
                          <th>التغير</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.comparison.map((row) => (
                          <tr key={row.key}>
                            <td>{row.label}</td>
                            <td>
                              {row.current}
                              {row.unit}
                            </td>
                            <td>
                              {row.previous}
                              {row.unit}
                            </td>
                            <td
                              className={
                                row.delta === 0
                                  ? ""
                                  : row.improved
                                    ? "delta-up"
                                    : "delta-down"
                              }
                            >
                              <bdi>
                                {row.delta > 0 ? "+" : ""}
                                {row.delta}
                                {row.unit}
                              </bdi>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="empty">لا يوجد سايكل سابق مسند إليك للمقارنة.</p>
              ))}
          </div>
          <button className="primary full" onClick={() => window.print()}>
            تنزيل تقرير التحليل PDF
          </button>
        </>
      )}
    </section>
  );
}
