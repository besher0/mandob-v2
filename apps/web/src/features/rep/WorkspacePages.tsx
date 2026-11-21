"use client";
import { ThemeIcon } from "../platform/ThemeIcon";
import { useState } from "react";
import { Dashboard, Stats, TargetType, Workspace } from "@/lib/api";
import { TargetList } from "./TargetList";

export function PageHead({
  title,
  onBack,
}: {
  title: string;
  onBack: () => void;
}) {
  return (
    <div className="page-head">
      <h2>{title}</h2>
      <button className="back" aria-label="رجوع" onClick={onBack}>
        ←
      </button>
    </div>
  );
}
export function EntityStats({
  stats,
  type,
}: {
  stats?: Stats;
  type: TargetType;
}) {
  const labels =
    type === "DOCTOR"
      ? ["إجمالي الأطباء", "غير مزار", "أطباء A"]
      : type === "PHARMACY"
        ? ["إجمالي الصيدليات", "غير مزارة", "فئة A"]
        : ["إجمالي المشافي", "بحاجة زيارة", "مشفى خاص"];
  const values = [
    stats?.total ?? 0,
    stats?.unvisited ?? 0,
    (type === "HOSPITAL" ? stats?.privateCount : stats?.aCount) ?? 0,
  ];
  return (
    <div className="stats-row">
      {labels.map((label, i) => (
        <div className="mini" key={label}>
          <strong>{values[i]}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}
export function EntityPage({
  type,
  workspace,
  token,
  onBack,
}: {
  type: TargetType;
  workspace: Workspace;
  token: string;
  onBack: () => void;
}) {
  const pharmacy = type === "PHARMACY";
  const title = pharmacy ? "الصيدليات" : "المشافي";
  const stats = pharmacy
    ? workspace.summary?.pharmacies
    : workspace.summary?.hospitals;
  return (
    <section className="screen">
      <PageHead title={title} onBack={onBack} />
      <div
        className={`entity-hero ${pharmacy ? "pharmacy-hero" : "hospital-hero"}`}
      >
        <div>
          <strong>دليل {title}</strong>
          <p className="meta">
            {pharmacy
              ? `${stats?.total ?? 0} صيدلية ضمن مناطقك، مصنفة حسب الفئة والتبعية.`
              : "المشافي العامة والخاصة والمراكز التخصصية ضمن منطقتك."}
          </p>
        </div>
        <ThemeIcon name={pharmacy ? "pharmacies" : "hospitals"} size={28}/>
      </div>
      <EntityStats type={type} stats={stats} />
      <TargetList key={type} token={token} workspace={workspace} type={type} />
    </section>
  );
}
export function AreasPage({
  workspace,
  onBack,
  onOpen,
}: {
  workspace: Workspace;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const areas = workspace.areas.filter((a) => a.name.includes(search.trim()));
  return (
    <section className="screen">
      <PageHead title="المناطق" onBack={onBack} />
      <div className="search">
        <input
          aria-label="ابحث عن منطقة"
          placeholder="ابحث عن منطقة"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {areas.map((a) => (
        <button
          className="list-card area-link"
          key={a.id}
          onClick={() => onOpen(a.id)}
        >
          <div className="row">
            <strong>{a.name}</strong>
            <span className={`badge ${a.coverage < 50 ? "red" : "green"}`}>
              {a.coverage}%
            </span>
          </div>
          <p className="meta">
            {a.total} طبيب • {a.unvisited} غير مزار • {a.aCount} أطباء A
          </p>
          <progress max={100} value={a.coverage} aria-label="تغطية المنطقة" />
        </button>
      ))}
      {!areas.length && <p className="empty">لا توجد مناطق مطابقة.</p>}
    </section>
  );
}
export function AreaDetail({
  areaId,
  type,
  onType,
  workspace,
  token,
  onBack,
}: {
  areaId: string;
  type: TargetType;
  onType: (type: TargetType) => void;
  workspace: Workspace;
  token: string;
  onBack: () => void;
}) {
  const area = workspace.areas.find((a) => a.id === areaId);
  if (!area)
    return (
      <section className="screen">
        <PageHead title="المنطقة" onBack={onBack} />
        <p className="empty">المنطقة غير متاحة ضمن تكليفاتك الحالية.</p>
      </section>
    );
  const stats = area.byType[type];
  return (
    <section className="screen">
      <PageHead title={area.name} onBack={onBack} />
      <div className="hero area-hero">
        <p>تغطية المنطقة</p>
        <h2>{stats.coverage}%</h2>
        <progress value={stats.coverage} max={100} />
      </div>
      <div className="tabs">
        {(
          [
            ["DOCTOR", "أطباء"],
            ["PHARMACY", "صيدليات"],
            ["HOSPITAL", "مشافي"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            className={`tab ${type === value ? "active" : ""}`}
            onClick={() => onType(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <EntityStats stats={stats} type={type} />
      <TargetList
        key={`${areaId}:${type}`}
        token={token}
        workspace={workspace}
        type={type}
        areaIds={[areaId]}
      />
    </section>
  );
}
export function PlanPage({
  workspace,
  dashboard,
  onBack,
}: {
  workspace: Workspace;
  dashboard: Dashboard;
  onBack: () => void;
}) {
  return (
    <section className="screen">
      <PageHead title="الخطة" onBack={onBack} />
      <div className="hero">
        <p>السايكل الحالي</p>
        <h2>{workspace.cycle?.name ?? "لا يوجد سايكل فعال"}</h2>
        <div className="hero-row">
          <div className="hero-stat">
            <strong>{workspace.summary?.doctors.coverage ?? 0}%</strong>
            <span>التغطية</span>
          </div>
          <div className="hero-stat">
            <strong>{workspace.cycle?.remainingDays ?? 0} أيام</strong>
            <span>المتبقي</span>
          </div>
        </div>
      </div>
      <div className="section-title">
        <h3>أصنافي</h3>
        <span className="meta">{workspace.products.length} أصناف</span>
      </div>
      {workspace.products.map((p) => (
        <div className="product-card" key={p.id}>
          <div>
            <strong>{p.name}</strong>
            {p.guidance && <div className="meta">{p.guidance}</div>}
          </div>
          {p.priority !== null && (
            <span className="badge">أولوية {p.priority}</span>
          )}
        </div>
      ))}
      {!workspace.products.length && (
        <p className="empty">لا توجد أصناف مسندة إليك.</p>
      )}
      <div className="section-title">
        <h3>أهدافي</h3>
      </div>
      <div className="list-card">
        <div className="row">
          <strong>الزيارات الأسبوعية</strong>
          <strong>{dashboard.weeklySummary.workingDayTarget}</strong>
        </div>
        <div className="meta">
          المنجز حالياً {dashboard.weeklySummary.completedVisits} زيارة.
        </div>
      </div>
      <div className="list-card">
        <div className="row">
          <strong>تغطية أطباء A</strong>
          <strong>
            {workspace.plan?.aCoverageTarget != null
              ? `${workspace.plan.aCoverageTarget}%`
              : "غير محددة"}
          </strong>
        </div>
        <div className="meta">المطلوب خلال السايكل الحالي.</div>
      </div>
      <div className="section-title">
        <h3>تعليمات المدير</h3>
      </div>
      <div className="company-note">
        {workspace.plan?.managerInstructions || "لا توجد تعليمات مسجلة حالياً."}
      </div>
    </section>
  );
}
