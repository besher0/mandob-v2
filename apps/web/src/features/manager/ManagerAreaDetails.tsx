import type { ManagerWorkspace } from "./types";
import s from "./ManagerApp.module.css";
import { Empty } from "./TablePrimitives";

type Props = { selectedArea: ManagerWorkspace["areas"][number]; cycle: ManagerWorkspace["cycle"]; frequency: ManagerWorkspace["settings"]["frequency"]; onBack: () => void; };
export function ManagerAreaDetails({ selectedArea, cycle, frequency, onBack }: Props) {
  return (
<>
  <section className={s.card}>
    <div className={s.sectionHead}>
      <h2>{selectedArea.name}</h2>
      <button onClick={onBack}>
        العودة للمناطق
      </button>
    </div>
    <div className={s.kpis}>
      {(
        [
          [selectedArea.counts.reps, "المندوبون"],
          [selectedArea.counts.doctors, "الأطباء"],
          [selectedArea.counts.pharmacies, "الصيدليات"],
          [selectedArea.counts.hospitals, "المشافي"],
        ] as const
      ).map(([value, label]) => (
        <div className={s.kpi} key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
    {cycle && (
      <p>
        السايكل: <bdi>{cycle.startsOn}</bdi> —{" "}
        <bdi>{cycle.endsOn}</bdi>
      </p>
    )}
    <p className={s.muted}>
      {frequency
        .map((f) => `${f.code}: ${f.requiredVisits} زيارة`)
        .join(" • ") || "لم تُحدد تكرارات الزيارات للسايكل."}
    </p>
  </section>
  <h3>المندوبون المسؤولون عن المنطقة</h3>
  {selectedArea.reps.length ? (
    <div className={s.cards}>
      {selectedArea.reps.map((r) => (
        <article className={s.card} key={r.id}>
          <h3>{r.name}</h3>
          <p>
            الأطباء الذين تمت زيارتهم: {r.visitedDoctors} /{" "}
            {r.doctors}
          </p>
          <p>
            الزيارات المحتسبة للخطة: {r.creditedVisits} /{" "}
            {r.requiredVisits}
          </p>
          <div className={s.row}>
            <b>التغطية</b>
            <b>{r.coverage}%</b>
          </div>
          <progress value={r.coverage} max={100} />
        </article>
      ))}
    </div>
  ) : (
    <Empty>
      لا توجد تكليفات مندوبين محددة لهذه المنطقة ضمن فرقك.
    </Empty>
  )}
</>
  );
}
