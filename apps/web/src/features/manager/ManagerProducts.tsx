import type { ManagerWorkspace } from "./types";
import s from "./ManagerApp.module.css";
import { Empty } from "./TablePrimitives";

type Props = { products: ManagerWorkspace["products"]; };
export function ManagerProducts({ products }: Props) {
  return (
<div className={`${s.card} ${s.tableCard}`}>
  <table className={s.table}>
    <thead><tr><th>المنتج</th><th>المادة الفعالة</th></tr></thead>
    <tbody>{products.map((p) => (
      <tr key={p.id}><td><b>{p.name}</b></td><td>{p.genericName || "—"}</td></tr>
    ))}</tbody>
  </table>
  {!products.length && <Empty>لا توجد منتجات مرتبطة بفرقك.</Empty>}
</div>
  );
}
