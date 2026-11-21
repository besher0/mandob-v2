"use client";
import { Fragment, type ReactNode } from "react";
import { useViewState } from "@/lib/view-state";
import type { ManagerTarget, DoctorProgress } from "./types";
import { Empty, Table } from "./TablePrimitives";
import s from "./ManagerApp.module.css";
const kinds: Record<string, string> = {
  DOCTOR: "أطباء",
  PHARMACY: "صيدليات",
  HOSPITAL: "مشافي",
};

function GroupedTargetsTable({
  items,
  headers,
  renderRow,
}: {
  items: ManagerTarget[];
  headers: string[];
  renderRow: (item: ManagerTarget) => ReactNode;
}) {
  const [order, setOrder] = useViewState<string[]>(
    "manager/ManagerApp.tsx:order",
    [],
  );
  const [hidden, setHidden] = useViewState<string[]>(
    "manager/ManagerApp.tsx:hidden",
    [],
  );
  const [folded, setFolded] = useViewState<string[]>(
    "manager/ManagerApp.tsx:folded",
    [],
  );
  const keyOf = (item: ManagerTarget) =>
    item.type === "DOCTOR" ? (item.specialtyId ?? "no-specialty") : item.type;
  const groups = [
    ...new Map(
      items.map((item) => [
        keyOf(item),
        item.type === "DOCTOR"
          ? (item.specialties[0] ?? "بلا اختصاص")
          : (kinds[item.type] ?? item.type),
      ]),
    ).entries(),
  ].sort((a, b) => {
    const ai = order.indexOf(a[0]),
      bi = order.indexOf(b[0]);
    return (
      (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) ||
      a[1].localeCompare(b[1], "ar")
    );
  });
  function position(id: string, next: number) {
    const ids = groups.map(([key]) => key);
    ids.splice(ids.indexOf(id), 1);
    ids.splice(next, 0, id);
    setOrder(ids);
  }
  return (
    <>
      <details className={s.specialtyFilters}>
        <summary>اختيار المجموعات وترتيبها</summary>
        <div className={s.editorActions}>
          <button className={s.btn} onClick={() => setHidden([])}>
            إظهار الكل
          </button>
          <button className={s.btn} onClick={() => setOrder([])}>
            ترتيب أبجدي
          </button>
          <button className={s.btn} onClick={() => setFolded([])}>
            فتح الكل
          </button>
          <button
            className={s.btn}
            onClick={() => setFolded(groups.map(([id]) => id))}
          >
            طي الكل
          </button>
        </div>
        <div className={s.specialtyChoices}>
          {groups.map(([id, name], index) => (
            <div className={s.specialtyChoice} key={id}>
              <label className={s.bulkSelection}>
                <input
                  type="checkbox"
                  checked={!hidden.includes(id)}
                  onChange={(e) =>
                    setHidden((previous) =>
                      e.target.checked
                        ? previous.filter((key) => key !== id)
                        : [...previous, id],
                    )
                  }
                />
                {name}
              </label>
              <label className={s.specialtyPosition}>
                الترتيب
                <select
                  aria-label={`ترتيب ${name}`}
                  value={index}
                  onChange={(e) => position(id, Number(e.target.value))}
                >
                  {groups.map((_, i) => (
                    <option key={i} value={i}>
                      {[
                        "الأول",
                        "الثاني",
                        "الثالث",
                        "الرابع",
                        "الخامس",
                        "السادس",
                        "السابع",
                        "الثامن",
                        "التاسع",
                        "العاشر",
                      ][i] ?? `الموقع ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>
      </details>
      <Table headers={headers}>
        {groups
          .filter(([id]) => !hidden.includes(id))
          .map(([id, name]) => {
            const rows = items.filter((item) => keyOf(item) === id);
            return (
              <Fragment key={id}>
                <tr className={s.specialtyHeading}>
                  <th colSpan={headers.length} scope="rowgroup">
                    <button
                      type="button"
                      className={s.specialtyToggle}
                      aria-expanded={!folded.includes(id)}
                      aria-label={`${folded.includes(id) ? "فتح" : "طي"} ${name}`}
                      onClick={() =>
                        setFolded((previous) =>
                          previous.includes(id)
                            ? previous.filter((key) => key !== id)
                            : [...previous, id],
                        )
                      }
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                        style={{
                          transform: folded.includes(id)
                            ? "rotate(90deg)"
                            : undefined,
                        }}
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                      {name}
                      <span className={s.badge}>{rows.length}</span>
                    </button>
                  </th>
                </tr>
                {!folded.includes(id) && rows.map(renderRow)}
              </Fragment>
            );
          })}
      </Table>
      {groups.length > 0 && groups.every(([id]) => hidden.includes(id)) && (
        <Empty>اختر مجموعة لعرض بياناتها.</Empty>
      )}
    </>
  );
}
export function Targets({ items }: { items: ManagerTarget[] }) {
  return items.length ? (
    <GroupedTargetsTable
      items={items}
      headers={[
        "الجهة",
        "الاختصاص",
        "التصنيف",
        "المنطقة",
        "المندوب / الفريق",
        "الزيارات",
        "التغطية",
      ]}
      renderRow={(t) => (
        <tr key={t.key}>
          <td>
            <strong>{t.name}</strong>
          </td>
          <td>{t.specialties.join("، ") || "—"}</td>
          <td>
            <span className={s.badge}>{t.classCode}</span>
          </td>
          <td>{t.areas.map((a) => a.name).join("، ")}</td>
          <td>
            {t.repName}
            <p className={s.muted}>{t.teamName}</p>
          </td>
          <td>
            {t.completedVisits} من {t.requiredVisits}
          </td>
          <td>
            {t.coverage}%<progress max={100} value={t.coverage} />
          </td>
        </tr>
      )}
    />
  ) : (
    <Empty />
  );
}
export function DoctorCycleDetails({
  items,
  summary,
  cycleName,
}: {
  items: ManagerTarget[];
  summary: DoctorProgress;
  cycleName?: string;
}) {
  const [status, setStatus] = useViewState(
    "manager/ManagerApp.tsx:status",
    "ALL",
  );
  const rows = items.filter(
    (t) =>
      t.type === "DOCTOR" && (status === "ALL" || t.progressStatus === status),
  );
  return (
    <section className={s.cyclePanel}>
      <div className={s.detailSectionHeading}>
        <h3>متابعة أطباء السايكل</h3>
        {cycleName && <span className={s.badge}>{cycleName}</span>}
      </div>
      <p className={s.muted}>
        {summary.uniqueDoctors} طبيب فريد • {summary.assignments} تكليف مندوب /
        فريق. زيارة زميل لا تسدّ نقص تكليف آخر.
      </p>
      <div
        className={s.progressFilters}
        role="group"
        aria-label="فلتر إنجاز زيارات الأطباء"
      >
        {(
          [
            ["ALL", "الكل", summary.assignments],
            ["UNVISITED", "غير مزار", summary.unvisited],
            ["INCOMPLETE", "ناقص التكرار", summary.incomplete],
            ["COMPLETE", "مكتمل التكرار", summary.complete],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            className={`${s.progressFilter} ${status === key ? s.progressFilterActive : ""}`}
            aria-pressed={status === key}
            onClick={() => setStatus(key)}
          >
            <span>{label}</span>
            <strong>{count}</strong>
          </button>
        ))}
      </div>
      {rows.length ? (
        <GroupedTargetsTable
          items={rows}
          headers={[
            "الطبيب",
            "التصنيف",
            "المنطقة",
            "المندوب / الفريق",
            "المطلوب",
            "المنفّذ",
            "المتبقي",
            "آخر زيارة",
          ]}
          renderRow={(t) => (
            <tr key={t.key}>
              <td>{t.name}</td>
              <td>{t.classCode}</td>
              <td>{t.areas.map((a) => a.name).join("، ")}</td>
              <td>
                {t.repName}
                <p className={s.muted}>{t.teamName}</p>
              </td>
              <td>{t.requiredVisits}</td>
              <td>{t.completedVisits}</td>
              <td>{t.remainingVisits}</td>
              <td>
                <bdi>{t.lastVisit ?? "—"}</bdi>
              </td>
            </tr>
          )}
        />
      ) : (
        <Empty>لا توجد تكليفات أطباء ضمن هذا الفلتر.</Empty>
      )}
    </section>
  );
}
