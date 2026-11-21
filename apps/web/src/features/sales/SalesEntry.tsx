"use client";
import { useRef, useState, type FormEvent } from "react";
import { request } from "@/lib/api";
import { createClientRef } from "@/lib/client-ref";
import { useResource, ResourceState } from "../rep/useResource";
import { SalesItems, emptySalesItem } from "./SalesItems";
import type { SalesOptions, SalesVisit } from "./types";
import s from "./Sales.module.css";
import ui from "../manager/ManagerApp.module.css";

export function SalesEntry({
  token,
  order,
  visit,
  onSaved,
  onCancel,
}: {
  token: string;
  order: boolean;
  visit?: SalesVisit;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [provinceId, setProvince] = useState(visit?.provinceId ?? "");
  const [targetId, setTarget] = useState(visit?.targetId ?? "");
  const [items, setItems] = useState([emptySalesItem()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const clientRef = useRef<string | null>(null);
  const resource = useResource<SalesOptions>(
    `/sales/options${provinceId ? "?provinceId=" + provinceId : ""}`,
    token,
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const values = new FormData(event.currentTarget);
    clientRef.current ??= createClientRef();
    try {
      await request(order ? "/sales/orders" : "/sales/visits", token, {
        method: "POST",
        body: JSON.stringify({
          clientRef: clientRef.current,
          provinceId,
          targetId,
          date: values.get("date"),
          notes: values.get("notes"),
          ...(order
            ? {
                agentId: values.get("agentId"),
                currency: "SYP",
                items,
                ...(visit ? { visitId: visit.id } : {}),
              }
            : {}),
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر التسجيل.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const data = resource.data;
  return (
    <section className={s.panel}>
      <div className={s.panelHeading}>
        <span className={s.eyebrow}>
          {order ? "طلب للمراجعة" : "زيارة ميدانية"}
        </span>
        <h2>{order ? "طلب بيع جديد" : "تسجيل زيارة"}</h2>
        <p>
          {order
            ? "حدّد الجهة والوكيل، ثم أضف الأصناف والعروض."
            : "سجّل الجهة وتاريخ الزيارة، سواء حصل بيع أم لا."}
        </p>
      </div>
      {visit && (
        <p>
          مرتبط بزيارة {visit.target.name} بتاريخ {visit.visitedOn.slice(0, 10)}
        </p>
      )}
      <form className={s.form} onSubmit={submit}>
        <fieldset disabled={busy} className={s.form}>
          {!data ? (
            <ResourceState error={resource.error} retry={resource.reload} />
          ) : (
            <>
              <div className={s.grid}>
                <label>
                  المحافظة
                  <select
                    required
                    disabled={!!visit}
                    value={provinceId}
                    onChange={(e) => {
                      setProvince(e.target.value);
                      setTarget("");
                    }}
                  >
                    <option value="">اختر المحافظة</option>
                    {data.provinces.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  الصيدلية أو المشفى
                  <select
                    required
                    disabled={!provinceId || !!visit}
                    value={targetId}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">اختر الجهة</option>
                    {data.targets.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.type === "PHARMACY" ? "صيدلية" : "مشفى"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {provinceId && !data.targets.length && (
                <p>
                  لا توجد صيدليات أو مشافٍ مرتبطة بهذه المحافظة. يضيفها المدير
                  العام من كتالوج الجهات.
                </p>
              )}
            </>
          )}
          <div className={s.grid}>
            <label>
              التاريخ
              <input
                type="date"
                name="date"
                required
                defaultValue={new Date().toLocaleDateString("en-CA", {
                  timeZone: "Asia/Damascus",
                })}
              />
            </label>
            {order && (
              <label>
                الوكيل المنفّذ
                <select
                  key={provinceId}
                  name="agentId"
                  required
                  disabled={!data || !provinceId}
                  defaultValue=""
                >
                  <option value="">اختر الوكيل</option>
                  {data?.agents
                    .filter((a) => a.provinceId === provinceId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
          </div>
          {order && data && (
            <>
              <SalesItems
                items={items}
                products={data.products}
                onChange={setItems}
              />
              {provinceId &&
                !data.agents.some((a) => a.provinceId === provinceId) && (
                  <p>
                    يجب أن يضيف المدير العام وكيلاً لهذه المحافظة قبل إرسال
                    الطلب.
                  </p>
                )}
            </>
          )}
          <label>
            ملاحظة
            <textarea name="notes" maxLength={2000} />
          </label>
          {error && (
            <p className={ui.error} role="alert">
              {error}
            </p>
          )}
          <div className={s.formFooter}>
            <button className={s.primaryButton} disabled={!data || !targetId}>
              {busy
                ? "جارِ التسجيل…"
                : order
                  ? "إرسال للمدير العام"
                  : "تسجيل الزيارة"}
            </button>
            <button type="button" className={s.button} onClick={onCancel}>
              إلغاء
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
