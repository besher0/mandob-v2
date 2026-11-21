"use client";
import { useEffect, useRef, useState, FormEvent } from "react";
import { request } from "@/lib/api";
import { useResource, ResourceState } from "../rep/useResource";
import type { ManagerWorkspace } from "./types";
import s from "./ManagerApp.module.css";
type Area = { id: string; name: string; provinceId: string; groupId: string | null };
type Catalog = { provinces: { id: string; name: string }[]; groups: { id: string; name: string; provinceId: string }[]; areas: Area[] };
function Editor({ catalog, item, group, token, close, saved, initialProvinceId }: { catalog: Catalog; initialProvinceId?:string; item?: Area; group: boolean; token: string; close: () => void; saved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name,setName] = useState(item?.name ?? "");
  const [provinceId,setProvince] = useState(item?.provinceId ?? (initialProvinceId || catalog.provinces[0]?.id || ""));
  const [groupId,setGroup] = useState(item?.groupId ?? "");
  const [busy,setBusy] = useState(false), [error,setError] = useState("");
  const pending = useRef(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); if (pending.current) return; pending.current = true; setBusy(true); setError("");
    try {
      await request(`/manager/${group ? "area-groups" : "areas"}${item ? `/${item.id}` : ""}`,token,{method:item ? "PATCH":"POST",body:JSON.stringify({name,provinceId,...(!group ? {groupId:groupId || null}:{})})}); saved();
    } catch(e) { setError(e instanceof Error ? e.message : "تعذر الحفظ"); }
    finally {pending.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} onCancel={close} className={s.editorDialog}><div className={s.sectionHead}><h3>{group ? "مجموعة جديدة" : item ? "تعديل المنطقة" : "إضافة منطقة"}</h3><button className={s.btn} onClick={close}>إغلاق</button></div><form onSubmit={save}>
    <label className={s.editorField}>الاسم<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} /></label>
    {catalog.provinces.length > 1 && <label className={s.editorField}>المحافظة<select disabled={!!item} value={provinceId} onChange={e=>{setProvince(e.target.value);setGroup("");}}>{catalog.provinces.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    {!group && <label className={s.editorField}>المجموعة<select value={groupId} onChange={e=>setGroup(e.target.value)}><option value="">غير مصنفة</option>{catalog.groups.filter(g=>g.provinceId===provinceId).map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
    {error && <p role="alert" className={s.error}>{error}</p>}<button className={s.btn} disabled={busy || !provinceId}>{busy ? "جارِ الحفظ…" : "حفظ"}</button>
  </form></dialog>;
}
export function AreaCatalog({token,canManage,metrics,search,areaId,provinceId,onDetail,onRefresh}:{token:string;canManage:boolean;metrics:ManagerWorkspace["areas"];search:string;areaId:string;provinceId?:string;onDetail:(id:string)=>void;onRefresh:()=>void}) {
  const resource=useResource<Catalog>("/manager/area-catalog",token);
  const [editor,setEditor]=useState<{group:boolean;item?:Area}|null>(null);
  if (!resource.data) return <ResourceState error={resource.error} retry={resource.reload}/>;
  const data=resource.data;
  const areas=data.areas.filter(a=>(!provinceId||a.provinceId===provinceId)&&a.name.includes(search.trim())&&(!areaId||a.id===areaId));
  const sections=[...data.groups.filter(g=>!provinceId||g.provinceId===provinceId).map(g=>({id:g.id,name:g.name,areas:areas.filter(a=>a.groupId===g.id)})),{id:"",name:"غير مصنفة",areas:areas.filter(a=>!a.groupId)}];
  return <>
    {canManage && <div className={s.editorActions}><button className={`${s.btn} ${s.secondary}`} onClick={()=>setEditor({group:true})}>+ مجموعة جديدة</button><button className={s.btn} onClick={()=>setEditor({group:false})}>+ إضافة منطقة</button></div>}
    {sections.filter(section=>section.id || section.areas.length).map(section=><section key={section.id}><div className={s.sectionHead}><h3>{section.name}</h3><span>{section.areas.length} منطقة</span></div><div className={s.cards}>{section.areas.map(a=>{const m=metrics.find(x=>x.id===a.id);return <article className={s.card} key={a.id}><div className={s.row}><h3>📍 {a.name}</h3>{m&&<span className={s.badge}>{m.counts.reps} مندوب</span>}</div><p className={s.muted}>{data.provinces.find(p=>p.id===a.provinceId)?.name} • {section.name}</p>{m&&<><div className={s.entityMeta}><div><span>التغطية</span><b>{m?.coverage ?? 0}%</b></div></div><progress value={m.coverage} max={100}/></>}<div className={s.editorActions}>{m && <button className={`${s.btn} ${s.secondary}`} onClick={()=>onDetail(a.id)}>عرض التفاصيل</button>}{canManage && <button className={`${s.btn} ${s.secondary}`} onClick={()=>setEditor({group:false,item:a})}>تعديل</button>}</div></article>;})}</div>{!section.areas.length&&<p className={s.muted}>لا توجد مناطق ضمن هذه المجموعة</p>}</section>)}
    {editor&&<Editor catalog={data} initialProvinceId={provinceId} {...editor} token={token} close={()=>setEditor(null)} saved={()=>{setEditor(null);resource.reload();onRefresh();}}/>}
  </>;
}
