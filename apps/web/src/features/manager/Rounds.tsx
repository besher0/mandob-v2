"use client";
import s from "./ManagerApp.module.css";
import type { ManagerRound } from "./types";
import { Empty, Table } from "./TablePrimitives";
const kinds: Record<string, string> = {
  DOCTOR: "أطباء",
  PHARMACY: "صيدليات",
  HOSPITAL: "مشافي",
};

export function Rounds({
  items,
  onOpen,
}: {
  items: ManagerRound[];
  onOpen: (r: ManagerRound) => void;
}) {
  return items.length ? (
    <Table
      headers={[
        "المندوب",
        "نوع الجولة",
        "المنطقة",
        "عدد الزيارات",
        "التاريخ",
        "التفاصيل",
      ]}
    >
      {items.map((r) => (
        <tr key={r.id}>
          <td>{r.repName}</td>
          <td>{kinds[r.type]}</td>
          <td>{r.areas.map((a) => a.name).join("، ")}</td>
          <td>{r.visits.length}</td>
          <td>
            <bdi>{r.date}</bdi>
          </td>
          <td>
            <button className={s.btn} onClick={() => onOpen(r)}>
              عرض التفاصيل
            </button>
          </td>
        </tr>
      ))}
    </Table>
  ) : (
    <Empty>لا توجد جولات مسجلة ضمن نطاق فرقك.</Empty>
  );
}
