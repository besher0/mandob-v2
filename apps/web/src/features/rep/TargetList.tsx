"use client";
import { useViewState } from "@/lib/view-state";
import { useEffect, useRef, useState } from "react";
import {
  affiliationLabels,
  hospitalLabels,
  emptyFilters,
  Filters,
  getTargets,
  Target,
  TargetType,
  Workspace,
} from "@/lib/api";

export function TargetCard({
  target,
  selected,
  onSelect,
  visitsLabel = "زيارات السايكل",
  lastVisitLabel = "آخر زيارة",
}: {
  target: Target;
  visitsLabel?: string;
  lastVisitLabel?: string;
  selected?: boolean;
  onSelect?: (target: Target, checked: boolean) => void;
}) {
  const content = (
    <>
      <div className="row">
        <strong>{target.name}</strong>
        <span className={`badge ${target.class.code.toLowerCase()}`}>
          {target.class.code}
        </span>
      </div>
      <div className="meta">
        {[
          target.affiliation ? affiliationLabels[target.affiliation] : null,
          target.kind ? hospitalLabels[target.kind] : null,
          ...target.specialties.map((s) => s.name),
        ]
          .filter(Boolean)
          .join("، ")}{" "}
        • {target.locations.map((l) => l.areaName).join("، ")}
      </div>
      <div className="row card-detail">
        <div className="meta">
          {lastVisitLabel}: {target.lastVisit ?? "—"}
        </div>
        <span
          className={`badge ${target.status === "غير مزار" ? "red" : "green"}`}
        >
          {target.status}
        </span>
      </div>
      <div className="meta">
        {visitsLabel}: {target.completedVisits} من {target.requiredVisits}
      </div>
      <progress
        max={100}
        value={target.progress}
        aria-label="تقدم زيارات السايكل"
      />
    </>
  );
  return onSelect ? (
    <label className="list-card check-card">
      <input
        type="checkbox"
        checked={selected}
        onChange={(e) => onSelect(target, e.target.checked)}
      />
      <div>{content}</div>
    </label>
  ) : (
    <article className="list-card">{content}</article>
  );
}

export function TargetList({
  token,
  workspace,
  type = "DOCTOR",
  areaIds = [],
  selected = [],
  onSelect,
}: {
  token: string;
  workspace: Workspace;
  type?: TargetType;
  areaIds?: string[];
  selected?: Target[];
  onSelect?: (target: Target, checked: boolean) => void;
}) {
  const [filters, setFilters] = useViewState<Filters>(`rep-targets:${type}:${areaIds.join(",")}`, emptyFilters);
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [state, setState] = useState<{
    key: string;
    items: Target[];
    error: string;
  }>({ key: "", items: [], error: "" });
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const queryKey = JSON.stringify({ type, filters, areaIds, retry });
  useEffect(() => {
    const controller = new AbortController();
    const query = JSON.parse(queryKey) as {
      type: TargetType;
      filters: Filters;
      areaIds: string[];
    };
    let pending = false;
    const fetchTargets = async () => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        const result = await getTargets(
          token, query.type, query.filters, query.areaIds, controller.signal,
        );
        if (!controller.signal.aborted)
          setState({ key: queryKey, items: result.items, error: "" });
      } catch (err) {
        if (!controller.signal.aborted)
          setState(previous => previous.key === queryKey && !previous.error
            ? previous
            : { key: queryKey, items: [], error: err instanceof Error ? err.message : "تعذر التحميل" });
      } finally {
        pending = false;
      }
    };
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void fetchTargets();
    };
    const timer = setTimeout(fetchTargets, 180);
    const interval = window.setInterval(refreshVisible, 15000);
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
      controller.abort();
    };
  }, [token, queryKey]);
  const toggle = (
    key: "classIds" | "specialtyIds" | "affiliations" | "kinds",
    id: string,
  ) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(id)
        ? d[key].filter((x) => x !== id)
        : [...d[key], id],
    }));
  const count =
    filters.affiliations.length +
    filters.kinds.length +
    filters.classIds.length +
    filters.specialtyIds.length +
    Number(filters.unvisited);
  return (
    <>
      <div className="search rep-search-tools">
        <input
          aria-label="بحث الجهات"
          placeholder={
            onSelect
              ? "ابحث ضمن المناطق المحددة"
              : type === "PHARMACY"
                ? "ابحث باسم الصيدلية أو المنطقة"
                : type === "HOSPITAL"
                  ? "ابحث باسم المشفى أو الاختصاص"
                  : "ابحث باسم الطبيب أو الاختصاص"
          }
          value={filters.search}
          onChange={(e) =>
            setFilters((f) => ({ ...f, search: e.target.value }))
          }
        />
            <button
              className="chip rep-filter-trigger"
              onClick={() => {
                setDraft(filters);
                dialog.current?.showModal();
              }}
            >
              الفلاتر {count > 0 && <span>{count}</span>}
            </button>
      </div>
      {
        <>
          <div className="doctor-filter-bar">
            {count > 0 && (
              <button
                className="back"
                onClick={() =>
                  setFilters((f) => ({ ...emptyFilters(), search: f.search }))
                }
              >
                ↻ إعادة الضبط
              </button>
            )}
          </div>
          <div className="active-filter-chips">
            {workspace.classes
              .filter((c) => filters.classIds.includes(c.id))
              .map((c) => (
                <button
                  className="chip"
                  key={c.id}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      classIds: f.classIds.filter((id) => id !== c.id),
                    }))
                  }
                >
                  {c.code} ×
                </button>
              ))}
            {workspace.specialties
              .filter((s) => filters.specialtyIds.includes(s.id))
              .map((s) => (
                <button
                  className="chip"
                  key={s.id}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      specialtyIds: f.specialtyIds.filter((id) => id !== s.id),
                    }))
                  }
                >
                  {s.name} ×
                </button>
              ))}
            {filters.unvisited && (
              <button
                className="chip"
                onClick={() => setFilters((f) => ({ ...f, unvisited: false }))}
              >
                غير مزار ×
              </button>
            )}
          </div>
        </>
      }
      {state.key !== queryKey ? (
        <p role="status" className="empty">
          جارِ تحميل الجهات…
        </p>
      ) : state.error ? (
        <div className="error" role="alert">
          {state.error}
          <button className="back" onClick={() => setRetry((x) => x + 1)}>
            إعادة المحاولة
          </button>
        </div>
      ) : state.items.length === 0 ? (
        <p className="empty">لا توجد جهات مطابقة.</p>
      ) : (
        state.items.map((target) => (
          <TargetCard
            key={target.id}
            target={target}
            selected={selected.some((t) => t.id === target.id)}
            onSelect={onSelect}
          />
        ))
      )}
      <dialog
        ref={dialog}
        className="filter-sheet"
        aria-labelledby="filters-title"
      >
        <div className="row">
          <strong id="filters-title">
            فلترة{" "}
            {type === "DOCTOR"
              ? "الأطباء"
              : type === "PHARMACY"
                ? "الصيدليات"
                : "المشافي"}
          </strong>
          <button
            className="back"
            aria-label="إغلاق الفلاتر"
            onClick={() => dialog.current?.close()}
          >
            ✕
          </button>
        </div>
        {type !== "HOSPITAL" && (
          <>
            <h3>التصنيف</h3>
            <div className="filter-options">
              {workspace.classes.map((c) => (
                <button
                  className={`chip ${draft.classIds.includes(c.id) ? "selected" : ""}`}
                  aria-pressed={draft.classIds.includes(c.id)}
                  key={c.id}
                  onClick={() => toggle("classIds", c.id)}
                >
                  {c.code}
                </button>
              ))}
            </div>
          </>
        )}
        {type !== "DOCTOR" && (
          <>
            <h3>{type === "PHARMACY" ? "التبعية" : "نوع المنشأة"}</h3>
            <div className="filter-options">
              {Object.entries(
                type === "PHARMACY" ? affiliationLabels : hospitalLabels,
              ).map(([code, label]) => {
                const key = type === "PHARMACY" ? "affiliations" : "kinds";
                return (
                  <button
                    key={code}
                    className={`chip ${draft[key].includes(code) ? "selected" : ""}`}
                    aria-pressed={draft[key].includes(code)}
                    onClick={() => toggle(key, code)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </>
        )}
        <h3>حالة الزيارة</h3>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={draft.unvisited}
            onChange={(e) =>
              setDraft((d) => ({ ...d, unvisited: e.target.checked }))
            }
          />{" "}
          غير مزار
        </label>
        {type !== "PHARMACY" && (
          <>
            <h3>الاختصاص</h3>
            {workspace.specialties.map((s) => (
              <label className="filter-check" key={s.id}>
                <input
                  type="checkbox"
                  checked={draft.specialtyIds.includes(s.id)}
                  onChange={() => toggle("specialtyIds", s.id)}
                />
                {s.name}
              </label>
            ))}
          </>
        )}
        <div className="filter-sheet-actions">
          <button
            className="back"
            onClick={() =>
              setDraft((d) => ({ ...emptyFilters(), search: d.search }))
            }
          >
            مسح الكل
          </button>
          <button
            className="primary"
            onClick={() => {
              setFilters(draft);
              dialog.current?.close();
            }}
          >
            تطبيق الفلاتر
          </button>
        </div>
      </dialog>
    </>
  );
}
