"use client";
import { useRef, useState, type FormEvent } from "react";
import { request } from "@/lib/api";
import { useResource, ResourceState } from "../rep/useResource";
import {
  statusLabels,
  type SalesOrder,
  type SalesPage,
  type SalesVisit,
} from "./types";
import s from "./Sales.module.css";
import ui from "../manager/ManagerApp.module.css";

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className={s.pager}>
      <button
        className={s.button}
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        السابق
      </button>
      <span>
        صفحة {page} — {total} سجل
      </span>
      <button
        className={s.button}
        disabled={page * 30 >= total}
        onClick={() => onPage(page + 1)}
      >
        التالي
      </button>
    </div>
  );
}
export function SalesVisits({
  token,
  review,
  onOrder,
}: {
  token: string;
  review: boolean;
  onOrder: (visit: SalesVisit) => void;
}) {
  const [page, setPage] = useState(1);
  const resource = useResource<SalesPage<SalesVisit>>(
    `/sales/visits?page=${page}`,
    token,
    15000,
  );
  if (!resource.data)
    return <ResourceState error={resource.error} retry={resource.reload} />;
  return (
    <div className={s.list}>
      {!resource.data.items.length && (
        <div className={s.empty}>
          <h3>لا توجد زيارات مسجلة</h3>
          <p>ستظهر هنا الجهات وتواريخ الزيارات بعد تسجيلها.</p>
        </div>
      )}
      {resource.data.items.map((visit) => (
        <article className={s.record} key={visit.id}>
          <h3>{visit.target.name}</h3>
          <p>
            {visit.province.name} • {visit.visitedOn.slice(0, 10)}
            {review && ` • ${visit.author.name}`}
          </p>
          <p className={s.note}>{visit.notes}</p>
          {!review && (
            <button className={s.button} onClick={() => onOrder(visit)}>
              إضافة طلب بيع لهذه الزيارة
            </button>
          )}
        </article>
      ))}
      <Pager page={page} total={resource.data.total} onPage={setPage} />
    </div>
  );
}
export function SalesOrders({
  token,
  review,
}: {
  token: string;
  review: boolean;
}) {
  const [page, setPage] = useState(1);
  const resource = useResource<SalesPage<SalesOrder>>(
    `/sales/orders?page=${page}`,
    token,
    15000,
  );
  if (!resource.data)
    return <ResourceState error={resource.error} retry={resource.reload} />;
  return (
    <div className={s.list}>
      {!resource.data.items.length && (
        <div className={s.empty}>
          <h3>لا توجد طلبات بيع</h3>
          <p>ستظهر هنا الطلبات وتفاصيلها وحالة مراجعتها.</p>
        </div>
      )}
      {resource.data.items.map((order) => (
        <details key={order.id} className={s.record}>
          <summary>
            <span>
              {order.target.name} — {order.province.name}
            </span>
            <span className={s.status} data-status={order.status}>
              {statusLabels[order.status]}
            </span>
            <span className={s.amount}>
              {order.total} <small>ل.س</small>
            </span>
            <span className={s.chevron} aria-hidden="true">
              ⌄
            </span>
          </summary>
          <p>
            التاريخ: {order.orderedOn.slice(0, 10)} • مدير المبيعات:{" "}
            {order.author.name} • الوكيل: {order.agent.name}
          </p>
          <div className={s.scroll}>
            <table>
              <thead>
                <tr>
                  <th>الصنف</th>
                  <th>الكمية</th>
                  <th>سعر الوحدة ل.س</th>
                  <th>العرض</th>
                  <th>المجموع ل.س</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td>{item.productName}</td>
                    <td>{item.quantity}</td>
                    <td>{item.unitPrice}</td>
                    <td>
                      {item.offerType === "BONUS"
                        ? `${item.bonusQuantity} قطع مجانية`
                        : item.offerType === "DISCOUNT"
                          ? `${item.discountPercent}% حسم`
                          : "بدون عرض"}
                    </td>
                    <td>{item.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={s.note}>{order.notes}</p>
          {order.reviewer && <p>راجعه: {order.reviewer.name}</p>}
          {order.reviewNote && (
            <p className={s.note}>ملاحظة المدير: {order.reviewNote}</p>
          )}
          {review && order.status === "PENDING" && (
            <ReviewOrder
              orderId={order.id}
              token={token}
              onSaved={resource.reload}
            />
          )}
        </details>
      ))}
      <Pager page={page} total={resource.data.total} onPage={setPage} />
    </div>
  );
}
function ReviewOrder({
  orderId,
  token,
  onSaved,
}: {
  orderId: string;
  token: string;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState("APPROVED");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    const values = new FormData(event.currentTarget);
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await request(`/sales/orders/${orderId}/review`, token, {
        method: "PATCH",
        body: JSON.stringify({ status, note: values.get("note") }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذرت المراجعة.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <form className={`${s.form} ${s.review}`} onSubmit={submit}>
      <h3>مراجعة الطلب</h3>
      <fieldset disabled={busy} className={s.form}>
        <label>
          القرار
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="APPROVED">موافقة</option>
            <option value="REJECTED">رفض</option>
          </select>
        </label>
        <label>
          {status === "REJECTED" ? "سبب الرفض" : "ملاحظة للطلب"}
          <textarea
            name="note"
            required={status === "REJECTED"}
            maxLength={2000}
          />
        </label>
        {error && (
          <p role="alert" className={ui.error}>
            {error}
          </p>
        )}
        <button className={s.primaryButton}>
          {busy ? "جارِ الحفظ…" : "تأكيد القرار"}
        </button>
      </fieldset>
    </form>
  );
}
