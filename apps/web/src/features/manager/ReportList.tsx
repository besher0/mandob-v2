"use client";
import s from "./ManagerApp.module.css";
import type { ManagerReport } from "./types";
import { useViewState } from "@/lib/view-state";
import { useResource } from "../rep/useResource";
import { Empty, Table } from "./TablePrimitives";
import { Load } from "./Load";

export function ReportList({
  token,
  onOpen,
}: {
  token: string;
  onOpen: (r: ManagerReport) => void;
}) {
  const [query, setQuery] = useViewState("manager/ManagerApp.tsx:query", "");
  const [period, setPeriod] = useViewState("manager/ManagerApp.tsx:period", "");
  const resource = useResource<{ items: ManagerReport[] }>(
    "/manager/reports",
    token,
    15000,
  );
  if (!resource.data)
    return <Load error={resource.error} retry={resource.reload} />;
  const rows = resource.data.items.filter(
    (r) =>
      (!period || r.report.period === period) &&
      `${r.report.rep.name} ${r.team.name}`.includes(query.trim()),
  );
  return (
    <>
      <div className={s.catalogToolbar}>
        <input
          className={s.catalogSearch}
          aria-label="بحث في التقارير"
          placeholder="ابحث باسم المندوب أو الفريق…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <details className={s.catalogMore}>
          <summary>الفلاتر{period ? " •" : ""}</summary>
          <div className={s.catalogMenu}>
            <label className={s.editorField}>
              نوع التقرير
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              >
                <option value="">كل التقارير</option>
                <option value="DAILY">يومي</option>
                <option value="WEEKLY">أسبوعي</option>
                <option value="CUSTOM">مخصص</option>
              </select>
            </label>
            <button
              className={`${s.btn} ${s.secondary}`}
              onClick={() => {
                setQuery("");
                setPeriod("");
              }}
            >
              مسح الفلاتر
            </button>
          </div>
        </details>
      </div>
      <p className={s.muted} role="status">
        {rows.length} تقرير
      </p>
      {rows.length ? (
        <Table
          headers={[
            "المندوب",
            "الفريق",
            "نوع التقرير",
            "الفترة",
            "الزيارات",
            "التفاصيل",
          ]}
        >
          {rows.map((r) => (
            <tr key={`${r.reportId}:${r.teamId}`}>
              <td>{r.report.rep.name}</td>
              <td>{r.team.name}</td>
              <td>
                {r.report.period === "WEEKLY"
                  ? "أسبوعي"
                  : r.report.period === "DAILY"
                    ? "يومي"
                    : "مخصص"}
              </td>
              <td>
                <bdi>
                  {r.snapshot.from} — {r.snapshot.to}
                </bdi>
              </td>
              <td>
                {r.snapshot.total}
                {r.snapshot.attributionComplete === false && (
                  <p className={s.muted}>بيانات الفريق غير مكتملة</p>
                )}
              </td>
              <td>
                <button className={s.btn} onClick={() => onOpen(r)}>
                  عرض التقرير
                </button>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>
          {resource.data.items.length
            ? "لا توجد تقارير مطابقة للبحث والفلاتر."
            : "لا توجد تقارير مرسلة إلى فرقك."}
        </Empty>
      )}
    </>
  );
}
