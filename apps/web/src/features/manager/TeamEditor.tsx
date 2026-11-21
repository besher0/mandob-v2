"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { request, type Named } from "@/lib/api";
import { useResource, ResourceState } from "../rep/useResource";
import s from "./ManagerApp.module.css";

type Options = {
  provinces?: Named[];
  team: Named & { specialtyIds: string[]; productIds: string[] };
  specialties: Named[];
  products: Named[];
};
type Reps = {
  cycle: Named;
  items: {
    id: string;
    rep: Named;
    areas: Named[];
    selected: boolean;
    configured: boolean;
    locked: boolean;
  }[];
};
const toggle = (ids: string[], id: string) =>
  ids.includes(id) ? ids.filter((v) => v !== id) : [...ids, id];
function TeamForm({
  data,
  token,
  done,
}: {
  data: Options;
  token: string;
  done: () => void;
}) {
  const [name, setName] = useState(data.team.name),
    [specialties, setSpecialties] = useState(data.team.specialtyIds),
    [products, setProducts] = useState(data.team.productIds),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [provinceId, setProvinceId] = useState(data.provinces?.[0]?.id ?? "");
  const pending = useRef(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await request(data.team.id ? `/manager/teams/${data.team.id}` : "/manager/teams", token, {
        method: data.team.id ? "PATCH" : "POST",
        body: JSON.stringify({
          name,
          ...(!data.team.id ? { provinceId } : {}),
          specialtyIds: specialties,
          productIds: products,
        }),
      });
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      {data.provinces && <label className={s.editorField}>المحافظة<select required value={provinceId} onChange={e=>setProvinceId(e.target.value)}><option value="">اختر المحافظة</option>{data.provinces.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}

      <label className={s.editorField}>
        اسم الفريق
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={120}
        />
      </label>
      <fieldset className={s.editorOptions}>
        <legend>الاختصاصات</legend>
        {data.specialties.map((x) => (
          <label key={x.id}>
            <input
              type="checkbox"
              checked={specialties.includes(x.id)}
              onChange={() => setSpecialties(toggle(specialties, x.id))}
            />
            {x.name}
          </label>
        ))}
      </fieldset>
      <fieldset className={s.editorOptions}>
        <legend>الأصناف</legend>
        {data.products.map((x) => (
          <label key={x.id}>
            <input
              type="checkbox"
              checked={products.includes(x.id)}
              onChange={() => setProducts(toggle(products, x.id))}
            />
            {x.name}
          </label>
        ))}
      </fieldset>
      <p className={s.muted}>
        تغييرات الاختصاصات والأصناف تطبّق على التكليفات الجديدة؛ تبقى التكليفات
        والزيارات المسجلة محفوظة.
      </p>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      <button className={s.btn} disabled={busy}>
        {busy ? "جارِ الحفظ…" : "حفظ الفريق"}
      </button>
    </form>
  );
}
function RepsForm({
  data,
  teamId,
  token,
  done,
}: {
  data: Reps;
  teamId: string;
  token: string;
  done: () => void;
}) {
  const [selected, setSelected] = useState(
      data.items.filter((r) => r.selected).map((r) => r.id),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await request(`/manager/teams/${teamId}/reps`, token, {
        method: "PATCH",
        body: JSON.stringify({ repCycleProfileIds: selected }),
      });
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      <p className={s.muted}>{data.cycle.name}</p>
      <div className={s.editorOptions}>
        {data.items.map((r) => (
          <label key={r.id}>
            <input
              type="checkbox"
              checked={selected.includes(r.id)}
              disabled={r.locked || busy}
              onChange={() => setSelected(toggle(selected, r.id))}
            />
            <span>
              <b>{r.rep.name}</b>
              <small>
                {r.areas.map((a) => a.name).join("، ") || "لا توجد مناطق مسندة"}
              </small>
              {r.locked && <small>تكليف له زيارات مسجلة؛ لا يمكن حذفه.</small>}
              {r.selected && !r.configured && (
                <small>سيكتمل ربط التكليف عند الحفظ.</small>
              )}
            </span>
          </label>
        ))}
      </div>
      {!data.items.length && (
        <p className={s.empty}>
          لا يوجد مندوبون مسندون لفرقك في هذه المحافظة والسايكل.
        </p>
      )}
      <p className={s.muted}>
        تُربط الجهات المطابقة لاختصاصات الفريق والأصناف المشتركة مع المندوب ضمن
        مناطقه المسندة. لا تُنقل زياراته السابقة بأثر رجعي.
      </p>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      <button className={s.btn} disabled={busy || !data.items.length}>
        {busy ? "جارِ الحفظ…" : "حفظ"}
      </button>
    </form>
  );
}
export function TeamEditor({
  teamId,
  mode,
  token,
  onClose,
  onSaved,
}: {
  teamId: string;
  mode: "settings" | "reps" | "create";
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const resource = useResource<Options | Reps>(
    mode === "create" ? "/manager/team-options" : `/manager/teams/${teamId}/${mode === "settings" ? "options" : "reps"}`,
    token,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className={`${s.dialog} ${s.editorDialog}`}
      ref={dialog}
      onCancel={onClose}
    >
      <div className={s.sectionHead}>
        <h3>{mode === "create" ? "إضافة فريق" : mode === "settings" ? "تعديل الفريق" : "إدارة مندوبين الفريق"}</h3>
        <button onClick={onClose} aria-label="إغلاق">
          ×
        </button>
      </div>
      {!resource.data ? (
        <ResourceState error={resource.error} retry={resource.reload} />
      ) : mode !== "reps" ? (
        <TeamForm
          data={resource.data as Options}
          token={token}
          done={onSaved}
        />
      ) : (
        <RepsForm
          data={resource.data as Reps}
          teamId={teamId}
          token={token}
          done={onSaved}
        />
      )}
      <button className={`${s.btn} ${s.secondary}`} onClick={onClose}>
        إلغاء
      </button>
    </dialog>
  );
}
