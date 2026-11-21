import type { ManagerWorkspace, ManagerRep, ManagerRound } from "./types";
import { RepLeaveBalance } from "./LeaveBalanceEditor";
import { DoctorCycleDetails, Targets } from "./TargetProgressTables";
import { Rounds } from "./Rounds";
import { Empty } from "./TablePrimitives";
import s from "./ManagerApp.module.css";

type Props = { data: ManagerWorkspace; selectedRep?: ManagerRep; repId: string; token: string; canManageBalances: boolean; onBack: () => void; onRound: (item: ManagerRound) => void };
export function ManagerRepDetails({ data, selectedRep, repId, token, canManageBalances, onBack, onRound }: Props) {
 return (
<>
  <button
    className={`${s.btn} ${s.secondary}`}
    onClick={onBack}
  >
    ← العودة للفريق
  </button>
  {selectedRep ? (
    <>
      <div className={s.detailIdentity}><h2>{selectedRep.name}</h2>
      <p className={s.muted}>
        {data.teams
          .filter((t) => selectedRep.teamIds.includes(t.id))
          .map((t) => t.name)
          .join("، ")}
      </p></div>
      <div className={s.kpis}>
        {[
          [selectedRep.completedVisits, "الزيارات"],
          [`${selectedRep.coverage}%`, "التغطية"],
          [selectedRep.requiredVisits, "الزيارات المطلوبة"],
        ].map(([v, l]) => (
          <div className={`${s.card} ${s.kpi}`} key={l}>
            <strong>{v}</strong>
            <span>{l}</span>
          </div>
        ))}
      </div>
      {canManageBalances && <RepLeaveBalance key={selectedRep.id} token={token} repId={selectedRep.id}/>}
      <DoctorCycleDetails key={selectedRep.id} items={data.targets.filter(t => t.repId === selectedRep.id)} summary={selectedRep.doctorProgress} cycleName={data.cycle?.name}/>
      <div className={s.detailSectionHeading}><h3>باقي الجهات المرتبطة ضمن فرقك</h3></div>
      <Targets
        items={data.targets.filter((t) => t.repId === repId && t.type !== "DOCTOR")}
      />
      <div className={s.detailSectionHeading}><h3>الجولات</h3></div>
      <Rounds
        items={data.rounds.filter((r) => r.repId === repId)}
        onOpen={onRound}
      />
    </>
  ) : (
    <Empty />
  )}
</>
 );
}
