import type { ManagerWorkspace } from "./types";
import s from "./ManagerApp.module.css";

type Props = { teams: ManagerWorkspace["teams"]; products: ManagerWorkspace["products"]; };
export function ManagerAnalytics({ teams, products }: Props) {
  return (
<div className={s.miniGrid}>
  <section className={s.card}>
    <h3>تغطية الفرق</h3>
    {teams.map((t) => (
      <div className={s.item} key={t.id}>
        <div className={s.row}>
          <b>{t.name}</b>
          <b>{t.coverage}%</b>
        </div>
        <progress value={t.coverage} max={100} />
      </div>
    ))}
  </section>
  <section className={s.card}>
    <h3>أداء المنتجات</h3>
    {products.map((p) => (
      <div className={`${s.item} ${s.row}`} key={p.id}>
        <b>{p.name}</b>
        <span>{p.promotions} ترويج</span>
      </div>
    ))}
  </section>
</div>
  );
}
