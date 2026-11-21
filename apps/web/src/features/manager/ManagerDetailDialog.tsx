import type { RefObject } from "react";
import type { ManagerRound, ManagerReport } from "./types";
import { kinds } from "./manager-navigation";
import s from "./ManagerApp.module.css";

export type ManagerDetail = { type: "round"; item: ManagerRound } | { type: "report"; item: ManagerReport };
type Props = { detail: ManagerDetail | null; dialog: RefObject<HTMLDialogElement | null> };
export function ManagerDetailDialog({ detail, dialog }: Props) {
 return (
<dialog className={s.dialog} ref={dialog}>
  <div className={s.sectionHead}>
    <h3>
      {detail?.type === "round" ? "تفاصيل الجولة" : "تفاصيل التقرير"}
    </h3>
    <button
      aria-label="إغلاق التفاصيل"
      onClick={() => dialog.current?.close()}
    >
      ✕
    </button>
  </div>
  {detail?.type === "round" ? (
    <>
      <strong>{detail.item.repName}</strong>
      {detail.item.registrationLocation?.status === 'CAPTURED' ? <div className={s.notice}><strong>موقع تسجيل الجولة</strong><p>وقت الالتقاط: <bdi>{detail.item.registrationLocation.capturedAt}</bdi></p><p>الدقة: {Math.round(detail.item.registrationLocation.accuracy ?? 0)} متر</p><a target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps?q=${detail.item.registrationLocation.latitude},${detail.item.registrationLocation.longitude}`}>فتح الموقع بالخريطة</a></div> : detail.item.registrationLocation?.status === 'OMITTED' ? <p className={s.notice}>سُجّلت بدون موقع: {detail.item.registrationLocation.reason}</p> : <p className={s.muted}>لا يوجد موقع تسجيل مرفق.</p>}
      <p className={s.muted}>
        {detail.item.date} • {kinds[detail.item.type]}
      </p>
      {detail.item.visits.map((v) => (
        <div className={s.item} key={v.id}>
          <b>{v.targetName}</b>
          <p>
            {v.products.map((p) => p.name).join("، ") ||
              "لا توجد أصناف مسجلة لهذه الزيارة"}
          </p>
        </div>
      ))}
    </>
  ) : detail?.type === "report" ? (
    <div className="print-report">
      <h3>
        {detail.item.report.rep.name} — {detail.item.team.name}
      </h3>
      <p>
        <bdi>
          {detail.item.snapshot.from} — {detail.item.snapshot.to}
        </bdi>
      </p>
      {detail.item.snapshot.attributionComplete === false && (
        <p className={s.notice}>
          لم يكتمل ربط الزيارات السابقة بالفرق؛ هذه الأرقام تخص الزيارات
          المرتبطة فقط.
        </p>
      )}
      <p>{detail.item.snapshot.total} زيارة</p>
      <p>
        أطباء: {detail.item.snapshot.doctors} • صيدليات:{" "}
        {detail.item.snapshot.pharmacies} • مشافي:{" "}
        {detail.item.snapshot.hospitals}
      </p>
      <p>المتوسط اليومي: {detail.item.snapshot.averagePerDay}</p>
    </div>
  ) : null}
</dialog>
 );
}
