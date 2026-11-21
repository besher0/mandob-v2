"use client";
import { useViewState } from "@/lib/view-state";
import { Fragment, useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { browserApiBase, request, type Named } from "@/lib/api";
import { useResource, ResourceState } from "../rep/useResource";
import type { ManagerTarget } from "./types";
import s from "./ManagerApp.module.css";
type Kind = "DOCTOR" | "PHARMACY" | "HOSPITAL";
type Target = Named & {
  type: Kind;
  areaId: string;
  targetClassId: string | null;
  classCode: string;
  specialtyId?: string;
  specialties: string[];
  areas: Named[];
  phone?: string;
  address?: string;
  notes?: string;
  affiliation?: string;
  kind?: string;
  hasVisits: boolean;
};
type Options = {
  areas: (Named & { province: { name: string } })[];
  classes: (Named & { code: string })[];
  specialties: Named[];
};
const names = { DOCTOR: "طبيب", PHARMACY: "صيدلية", HOSPITAL: "مشفى" };
const affiliations = {
  INDEPENDENT: "مستقلة",
  UNION: "نقابية",
  CLINIC: "مستوصف",
  HOSPITAL: "مشفى",
  GOVERNMENT: "حكومية",
};
const hospitalKinds = {
  PUBLIC: "حكومي",
  PRIVATE: "خاص",
  SPECIALIZED: "تخصصي",
  MEDICAL_CENTER: "مركز طبي",
};
function Form({
  item,
  type,
  options,
  provinceId,
  token,
  onClose,
  onSaved,
}: {
  item?: Target;
  type: Kind;
  options: Options;
  provinceId?:string;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? ""),
    [areaId, setArea] = useState(item?.areaId ?? ""),
    [classId, setClass] = useState(item?.targetClassId ?? ""),
    [specialtyId, setSpecialty] = useState(item?.specialtyId ?? ""),
    [phone, setPhone] = useState(item?.phone ?? ""),
    [address, setAddress] = useState(item?.address ?? ""),
    [notes, setNotes] = useState(item?.notes ?? ""),
    [subtype, setSubtype] = useState(
      (type === "PHARMACY" ? item?.affiliation : item?.kind) ?? "",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await request(
        (item ? `/manager/targets/${item.id}` : "/manager/targets") + (provinceId ? `?provinceId=${provinceId}` : ""),
        token,
        {
          method: item ? "PATCH" : "POST",
          body: JSON.stringify({
            type,
            name,
            areaId,
            targetClassId: classId,
            phone,
            address,
            notes,
            ...(type === "DOCTOR"
              ? { specialtyId }
              : subtype
                ? type === "PHARMACY"
                  ? { affiliation: subtype }
                  : { kind: subtype }
                : {}),
          }),
        },
      );
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذر الحفظ.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save}>
      {type === "DOCTOR" && options.specialties.length === 0 && <p className={s.notice}>لا توجد اختصاصات مسجلة للشركة. يلزم إضافة الاختصاصات من إدارة الشركة.</p>}
      <div className={s.repFormGrid}>
        <label className={s.editorField}>
          الاسم
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={180}
          />
        </label>
        {type === "DOCTOR" && (
          <label className={s.editorField}>
            الاختصاص
            <select
              required
              value={specialtyId}
              onChange={(e) => setSpecialty(e.target.value)}
            >
              <option value="">اختر الاختصاص</option>
              {options.specialties.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={s.editorField}>
          المنطقة
          <select
            value={areaId}
            required
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">اختر المنطقة</option>
            {options.areas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name} — {x.province.name}
              </option>
            ))}
          </select>
        </label>
        <label className={s.editorField}>
          التصنيف
          <select
            value={classId}
            required
            onChange={(e) => setClass(e.target.value)}
          >
            <option value="">اختر التصنيف</option>
            {options.classes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.code}
              </option>
            ))}
          </select>
        </label>
        <label className={s.editorField}>
          رقم الهاتف
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={40}
          />
        </label>
        {type !== "DOCTOR" && (
          <label className={s.editorField}>
            النوع
            <select
              value={subtype}
              onChange={(e) => setSubtype(e.target.value)}
            >
              <option value="">اختر النوع</option>
              {Object.entries(
                type === "PHARMACY" ? affiliations : hospitalKinds,
              ).map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className={s.editorField}>
        العنوان التفصيلي
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          maxLength={500}
        />
      </label>
      <label className={s.editorField}>
        ملاحظات
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </label>
      <p className={s.muted}>
        عدد الزيارات يأتي من تصنيف الجهة وقواعد السايكل. تغيير التصنيف يستخدم
        للتكليفات الجديدة ولا يغيّر التكليفات السابقة.
      </p>
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
      <div className={s.dialogFooter}>
      <button className={s.btn} disabled={busy || (type === "DOCTOR" && options.specialties.length === 0)}> 
        {busy ? "جارِ الحفظ…" : `حفظ ${names[type]}`}
      </button>
      <button type="button" className={`${s.btn} ${s.secondary}`} disabled={busy} onClick={onClose}>إلغاء</button>
      </div>
    </form>
  );
}
function Editor({
  provinceId,
  item,
  type,
  token,
  onClose,
  onSaved,
}: {
  provinceId?:string;
  item?: Target;
  type: Kind;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const resource = useResource<Options>(`/manager/target-options${provinceId ? `?provinceId=${provinceId}` : ""}`, token);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      className={`${s.dialog} ${s.editorDialog}`}
      ref={ref}
      onCancel={onClose}
    >
      <div className={s.sectionHead}>
        <h3>
          {item ? "تعديل" : "إضافة"} {names[type]}
        </h3>
        <button onClick={onClose} aria-label="إغلاق">
          ×
        </button>
      </div>
      {resource.data ? (
        <Form
          onClose={onClose}
          item={item}
          type={type}
          token={token}
          options={resource.data}
          provinceId={provinceId}
          onSaved={onSaved}
        />
      ) : (
        <ResourceState error={resource.error} retry={resource.reload} />
      )}

    </dialog>
  );
}
export function TargetCatalog({
  toolbar,
  catalogOnly = false,
  provinceId,
  type,
  token,
  canManage,
  search,
  areaId,
  assignments,
  onRefresh,
}: {
  toolbar?: ReactNode;
  catalogOnly?: boolean;
  provinceId?:string;
  type: Kind;
  token: string;
  canManage: boolean;
  search: string;
  areaId: string;
  assignments: ManagerTarget[];
  onRefresh: () => void;
}) {
  const resource = useResource<{ items: Target[]; canDelete: boolean; truncated: boolean; needsSpecialties: boolean }>(
    `/manager/targets?type=${type}${provinceId ? `&provinceId=${provinceId}` : ""}`,
    token,
  );
  const [editor, setEditor] = useState<{ item?: Target } | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [collapsedSpecialties, setCollapsedSpecialties] = useViewState<string[]>(`catalog:${type}:${provinceId ?? ""}:collapsedSpecialties`, []);
  const [specialtyOrder, setSpecialtyOrder] = useViewState<string[]>(`catalog:${type}:${provinceId ?? ""}:specialtyOrder`, []);
  const [hiddenSpecialties, setHiddenSpecialties] = useViewState<string[]>(`catalog:${type}:${provinceId ?? ""}:hiddenSpecialties`, []);
  const [deleting, setDeleting] = useState<Target[] | null>(null);
  const canDelete = resource.data?.canDelete ?? false;
  const input = useRef<HTMLInputElement>(null);
  const importing = useRef(false);
  const [downloading, setDownloading] = useState(false);
  const downloadLock = useRef(false);
  async function download(template = false) {
    if (downloadLock.current) return;
    downloadLock.current = true;
    setDownloading(true);
    setMessage("");
    try {
      const query = new URLSearchParams({ template: String(template), search, areaId, ...(provinceId ? {provinceId} : {}) });
      if (!template && type === "DOCTOR") query.set("specialtyOrder", JSON.stringify(groups.map(group => group.id)));
      const response = await fetch(`${browserApiBase()}/manager/doctors/export?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.message ?? "تعذر تصدير الملف.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = template ? "doctors-template.xlsx" : "doctors.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "تعذر التصدير.");
    } finally {
      downloadLock.current = false;
      setDownloading(false);
    }
  }
  async function upload(file?: File) {
    if (!file || importing.current) return;
    importing.current = true;
    setBusy(true);
    setMessage("");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await request<{
        imported: number;
        updated: number;
        replayed: boolean;
      }>(`/manager/doctors/import${provinceId ? `?provinceId=${provinceId}` : ""}`, token, { method: "POST", body });
      setMessage(
        result.replayed
          ? "هذا الملف مستورد سابقاً؛ لم تُكرر البيانات."
          : `تم استيراد ${result.imported} طبيب وتحديث ${result.updated}.`,
      );
      resource.reload();
      onRefresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "تعذر الاستيراد.");
    } finally {
      importing.current = false;
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  const specialtyMap = new Map<string, string>();
  for (const item of resource.data?.items ?? []) specialtyMap.set(item.specialtyId ?? "", item.specialties[0] ?? "بلا اختصاص");
  const orderedSpecialties = [...specialtyMap].sort((a, b) => {
    const ai = specialtyOrder.indexOf(a[0]), bi = specialtyOrder.indexOf(b[0]);
    return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || a[1].localeCompare(b[1], "ar");
  });
  function moveSpecialty(id: string, next: number) {
    const ids = orderedSpecialties.map(([key]) => key), index = ids.indexOf(id);
    if (next < 0 || next >= ids.length) return;
    ids.splice(index, 1);
    ids.splice(next, 0, id);
    setSpecialtyOrder(ids);
  }
  const items =
    resource.data?.items.filter(
      (t) =>
        (type !== "DOCTOR" || !hiddenSpecialties.includes(t.specialtyId ?? "")) &&
        (!areaId || t.areas.some((a) => a.id === areaId)) &&
        `${t.name} ${t.specialties.join(" ")}`.includes(search.trim()),
    ) ?? [];
  const groups = type === "DOCTOR"
    ? orderedSpecialties.filter(([id]) => !hiddenSpecialties.includes(id)).map(([id, name]) => ({ id, name, items: items.filter(item => (item.specialtyId ?? "") === id) }))
    : [{ id: "all", name: "", items }];
  const visibleItems = type === "DOCTOR" ? items.filter(item => !collapsedSpecialties.includes(item.specialtyId ?? "")) : items;
  const selected = visibleItems.filter(item => selectedIds.includes(item.id));
  const allSelected = visibleItems.length > 0 && selected.length === visibleItems.length;
  return (
    <>
      <div className={s.catalogToolbar}>
        {toolbar}
        {canManage && <button className={s.btn} onClick={() => setEditor({})}>+ إضافة {names[type]}</button>}
        {type === "DOCTOR" && <details className={s.catalogMore}><summary>المزيد ⋯</summary><div className={s.catalogMenu}>
          <button className={`${s.btn} ${s.secondary}`} disabled={downloading || busy} onClick={() => void download()}>تصدير Excel حسب الفلتر</button>
          {canManage && <><button className={`${s.btn} ${s.secondary}`} disabled={busy} onClick={() => input.current?.click()}>{busy ? "جارِ الاستيراد…" : "استيراد Excel"}</button>
          <button className={`${s.btn} ${s.secondary}`} disabled={downloading || busy} onClick={() => void download(true)}>تنزيل قالب الاستيراد</button>
          <details><summary>تعليمات الاستيراد</summary><p className={s.muted}>ملف .xlsx حتى 500 طبيب. الأعمدة: Name، Specailist، Doctor geo name، classification، وCity لتحديد محافظة المنطقة الجديدة أو عند تكرار اسمها. تحديث سجل موجود يتطلب عمود id؛ لا يتم دمج الأسماء تلقائياً. الموجود من المناطق والاختصاصات يُربط والجديد يُضاف حسب صلاحياتك. القالب والتصدير يدعمان المعرّفات أيضاً. حذف الصف من Excel لا يحذف الطبيب.</p></details></>}
        </div></details>}
        {canManage && type === "DOCTOR" && <input ref={input} hidden type="file" accept=".xlsx" onChange={e => void upload(e.target.files?.[0])}/>}
      </div>
      {message && (
        <p className={s.notice} role="status">
          {message}
        </p>
      )}
      {!resource.data ? (
        <ResourceState error={resource.error} retry={resource.reload} />
      ) : (
        <>
          {resource.data.needsSpecialties && <p className={s.notice}>حدد اختصاصات فرقك من «الفرق» لعرض الأطباء وإضافتهم.</p>}
          {resource.data.truncated && (
            <p className={s.notice}>تُعرض أول 1000 جهة فقط.</p>
          )}
          {type === "DOCTOR" && <details className={s.specialtyFilters}>
            <summary>اختيار الاختصاصات وترتيبها ({orderedSpecialties.filter(([id]) => !hiddenSpecialties.includes(id)).length} / {orderedSpecialties.length})</summary>
            <p className={s.muted}>اختر الاختصاصات المعروضة، وحدد موقع كل اختصاص في الترتيب. يتبع الجدول والتصدير هذا الترتيب.</p>
            <div className={s.editorActions}>
              <button className={`${s.btn} ${s.secondary}`} onClick={() => setHiddenSpecialties([])}>إظهار الكل</button>
              <button className={`${s.btn} ${s.secondary}`} onClick={() => setHiddenSpecialties(orderedSpecialties.map(([id]) => id))}>إلغاء اختيار الكل</button>
              <button className={`${s.btn} ${s.secondary}`} onClick={() => setSpecialtyOrder([])}>ترتيب أبجدي</button>
            </div>
            <div className={s.specialtyChoices}>{orderedSpecialties.map(([id, name], index) => <div className={s.specialtyChoice} key={id}>
              <label className={s.bulkSelection}><input type="checkbox" checked={!hiddenSpecialties.includes(id)} onChange={e => setHiddenSpecialties(previous => e.target.checked ? previous.filter(value => value !== id) : [...previous, id])}/>{name}</label>
              <label className={s.specialtyPosition}>الترتيب
                <select aria-label={`ترتيب ${name}`} value={index} onChange={e => moveSpecialty(id, Number(e.target.value))}>
                  {orderedSpecialties.map((_, position) => <option value={position} key={position}>{["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس", "السابع", "الثامن", "التاسع", "العاشر"][position] ?? `الموقع ${position + 1}`}</option>)}
                </select>
              </label>
            </div>)}</div>
          </details>}
          {canDelete && selectedIds.length > 0 && <div className={`${s.editorActions} ${s.selectionBar}`}>
            <span role="status">المحدد من النتائج المعروضة: {selected.length} / {visibleItems.length}</span>
            <button className={`${s.btn} ${s.bulkDanger}`} disabled={!selected.length || busy} onClick={() => setDeleting(selected)}>حذف المحدد ({selected.length})</button>
            {!!selectedIds.length && <button className={`${s.btn} ${s.secondary}`} disabled={busy} onClick={() => setSelectedIds([])}>إلغاء التحديد</button>}
          </div>}
          <div className={`${s.card} ${s.tableCard}`}>
            <table className={s.table}>
              <thead>
                <tr>
                  {canDelete && <th><label className={s.bulkSelection}><input type="checkbox" aria-label="تحديد كل النتائج المعروضة" checked={allSelected} disabled={!visibleItems.length || busy} ref={node => { if (node) node.indeterminate = selected.length > 0 && !allSelected; }} onChange={e => setSelectedIds(e.target.checked ? visibleItems.map(item => item.id) : [])}/>تحديد الكل</label></th>}
                  {[
                    "الجهة",
                    "الاختصاص / النوع",
                    "التصنيف",
                    "المنطقة",
                    ...(!catalogOnly ? ["المندوب / الفريق", "الزيارات", "التغطية"] : []),
                    ...(canManage ? ["الإجراءات"] : []),
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.filter(group => group.items.length > 0).map(group => <Fragment key={group.id}>
                  {type === "DOCTOR" && <tr className={s.specialtyHeading}><th scope="rowgroup" colSpan={4 + (canDelete ? 1 : 0) + (catalogOnly ? 0 : 3) + (canManage ? 1 : 0)}><button type="button" className={s.specialtyToggle} aria-expanded={!collapsedSpecialties.includes(group.id)} aria-label={`${collapsedSpecialties.includes(group.id) ? "فتح" : "طي"} أطباء ${group.name}`} onClick={() => { setCollapsedSpecialties(previous => previous.includes(group.id) ? previous.filter(id => id !== group.id) : [...previous, group.id]); setSelectedIds(previous => previous.filter(id => !group.items.some(item => item.id === id))); }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ transform: collapsedSpecialties.includes(group.id) ? "rotate(90deg)" : undefined }}><path d="m6 9 6 6 6-6"/></svg>{group.name} <span className={s.badge}>{group.items.length}</span></button></th></tr>}
                {(!collapsedSpecialties.includes(group.id) || type !== "DOCTOR") && group.items.map((t) => {
                  const linked = assignments.filter((a) => a.id === t.id);
                  return (
                    <tr key={t.id}>
                      {canDelete && <td><input className={s.bulkCheckbox} type="checkbox" aria-label={`تحديد ${names[type]} ${t.name}`} checked={selectedIds.includes(t.id)} disabled={busy} onChange={e => setSelectedIds(previous => e.target.checked ? [...previous, t.id] : previous.filter(id => id !== t.id))}/></td>}
                      <td>
                        <strong>{t.name}</strong>
                      </td>
                      <td>
                        {type === "DOCTOR"
                          ? t.specialties.join("، ")
                          : type === "PHARMACY"
                            ? (affiliations[
                                t.affiliation as keyof typeof affiliations
                              ] ?? "—")
                            : (hospitalKinds[
                                t.kind as keyof typeof hospitalKinds
                              ] ?? "—")}
                      </td>
                      <td>
                        <span className={s.badge}>{t.classCode}</span>
                      </td>
                      <td>{t.areas.map((a) => a.name).join("، ")}</td>
                      {!catalogOnly&&<><td>
                        {linked.length
                          ? linked.map((a) => (
                              <p key={a.key}>
                                {a.repName} / {a.teamName}
                              </p>
                            ))
                          : "غير مسندة"}
                      </td>
                      <td>
                        {linked.length
                          ? linked.map((a) => (
                              <p key={a.key}>
                                {a.completedVisits} / {a.requiredVisits}
                              </p>
                            ))
                          : "—"}
                      </td>
                      <td>
                        {linked.length
                          ? linked.map((a) => <p key={a.key}>{a.coverage}%</p>)
                          : "—"}
                      </td>
                      </>}
                      {canManage && (
                        <td>
                          <button
                            className={`${s.btn} ${s.secondary}`}
                            onClick={() => setEditor({ item: t })}
                          >
                            تعديل
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                </Fragment>)}
              </tbody>
            </table>
            {!items.length && (
              <p className={s.empty}>لا توجد جهات مطابقة ضمن نطاق فرقك.</p>
            )}
          </div>
        </>
      )}
      {deleting && <DeleteTargetsDialog provinceId={provinceId} targets={deleting} type={type} token={token} onClose={() => setDeleting(null)} onDeleted={count => { setDeleting(null); setSelectedIds([]); setMessage(`تم حذف ${count} جهة من القوائم مع الاحتفاظ بزياراتها السابقة.`); resource.reload(); onRefresh(); }}/>} 
      {editor && (
        <Editor
          provinceId={provinceId}
          item={editor.item}
          type={type}
          token={token}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            resource.reload();
            onRefresh();
          }}
        />
      )}
    </>
  );
}

function DeleteTargetsDialog({targets,type,token,provinceId,onClose,onDeleted}:{provinceId?:string;targets:Target[];type:Kind;token:string;onClose:()=>void;onDeleted:(count:number)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{dialog.current?.showModal();},[]);
  async function remove(e:FormEvent){
    e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{const result=await request<{deleted:number}>(`/manager/targets/bulk-delete${provinceId ? `?provinceId=${provinceId}` : ''}`,token,{method:'POST',body:JSON.stringify({type,ids:targets.map(t=>t.id)})});onDeleted(result.deleted);}
    catch(e){setError(e instanceof Error?e.message:'تعذر حذف الجهات.');}finally{lock.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} className={`${s.dialog} ${s.editorDialog}`} aria-labelledby="delete-targets-title" onCancel={e=>{if(busy)e.preventDefault();else onClose();}}><form onSubmit={remove}>
    <h2 id="delete-targets-title">حذف الجهات المحددة ({targets.length})</h2>
    <p>ستُخفى هذه الجهات من القوائم ولن تتاح لتسجيل زيارات جديدة. تبقى زياراتها السابقة وسجلات الجولات والتقارير محفوظة.</p>
    <ul className={s.bulkPreview}>{targets.map(t=><li key={t.id}><strong>{t.name}</strong> — {t.areas.map(a=>a.name).join('، ')}</li>)}</ul>
    {error&&<p className={s.error} role="alert">{error}</p>}
    <div className={s.editorActions}><button className={`${s.btn} ${s.bulkDanger}`} disabled={busy}>{busy?'جارِ الحذف…':`تأكيد حذف ${targets.length} جهة`}</button><button className={`${s.btn} ${s.secondary}`} type="button" autoFocus disabled={busy} onClick={onClose}>إلغاء</button></div>
  </form></dialog>;
}
