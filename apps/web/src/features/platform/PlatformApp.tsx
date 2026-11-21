"use client";
import { useViewState } from "@/lib/view-state";
import { useRef, useState, type FormEvent } from "react";
import { CompanyAccess } from '../company/CompanyAccess';
import { ThemePreview } from "./ThemePreview";
import { themePresets } from "./theme-presets";
import { request } from "@/lib/api";
import { ResourceState, useResource } from "../rep/useResource";
import { type Branding } from "./CompanyTheme";
import s from "./PlatformApp.module.css";
type Company = { id: string; name: string; code: string; status: string; _count: { users: number; teams: number } };
function BrandingEditor({ company, token }: { company: Company; token: string }) {
  const resource = useResource<Branding>(`/platform/companies/${company.id}/branding`, token);
  return resource.data ? <ThemeForm key={company.id} company={company} initial={resource.data} token={token}/> : <ResourceState error={resource.error} retry={resource.reload}/>;
}
function ThemeForm({company, initial, token}: {company: Company; initial: Branding; token: string}) {
  const [theme,setTheme] = useState(initial), [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  const lock = useRef(false);
  const set = (key: keyof Branding, value: string) => { setTheme(t=>({...t,[key]:value})); setMessage(""); };
  async function save(e: FormEvent) {
    e.preventDefault(); if(lock.current)return; lock.current=true; setBusy(true);setMessage("");
    try { const saved = await request<Branding>(`/platform/companies/${company.id}/branding`,token,{method:"PATCH",body:JSON.stringify(theme)});setTheme(saved);setMessage("تم تطبيق الهوية على الشركة. تظهر للحسابات المفتوحة خلال 30 ثانية."); }
    catch(e){setMessage(e instanceof Error?e.message:"تعذر الحفظ");}finally{setBusy(false);lock.current=false;}
  }
  async function logo(file?:File){
    if(!file)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)||file.size>40000){setMessage("اختر PNG أو JPEG أو WebP حتى 40 KB.");return;}
    const reader=new FileReader();reader.onload=()=>set("logo",String(reader.result));reader.onerror=()=>setMessage("تعذر قراءة الشعار");reader.readAsDataURL(file);
  }
  return <div className={s.editor}>
    <form onSubmit={save} className={s.card}>
      <h2>هوية {company.name}</h2>
      <fieldset disabled={busy}>
        <div className={s.presets} role="group" aria-label="قوالب التصميم">
          {themePresets.map(p=><button key={p.id} type="button" className={s.preset} aria-pressed={(theme.layout??"CLASSIC")===p.id} onClick={()=>{setTheme(t=>({...t,...p.values}));setMessage("تم تغيير المعاينة فقط. اضغط حفظ لتطبيق القالب على الشركة.");}}>
            <span className={s.swatches} aria-hidden="true"><i style={{background:p.values.sidebar}}/><i style={{background:p.values.primary}}/><i style={{background:p.values.background}}/></span><strong>{p.name}</strong><small>{p.description}</small>
          </button>)}
        </div>
        <p>اختيار القالب يضبط الشكل والألوان والخط، ويحافظ على اسم الشركة وشعارها. يمكنك تخصيص الألوان بعد الاختيار.</p>
        <label>اسم التطبيق عند الشركة<input required maxLength={100} value={theme.displayName} onChange={e=>set("displayName",e.target.value)}/></label>
        <label>الشعار (حتى 40 KB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void logo(e.target.files?.[0])}/></label>
        {theme.logo&&<button type="button" onClick={()=>set("logo","")}>إزالة الشعار</button>}
        {([["primary","اللون الأساسي"],["accent","اللون المساعد"],["sidebar","لون القائمة الجانبية"],["background","خلفية الصفحات"]] as const).map(([key,label])=><label key={key}>{label}<input type="color" value={theme[key] ?? "#0f766e"} onChange={e=>set(key,e.target.value)}/></label>)}
        <label>موقع تسجيل الجولة<select value={theme.roundLocationPolicy ?? "DISABLED"} onChange={e=>set("roundLocationPolicy",e.target.value)}><option value="DISABLED">معطّل</option><option value="OPTIONAL">اختياري — يلزم سبب عند عدم إرفاق الموقع</option><option value="REQUIRED">إلزامي عند التسجيل</option></select></label>
        <label>الخط<select value={theme.font} onChange={e=>set("font",e.target.value)}><option>Tahoma</option><option>Arial</option><option value="Cairo">Cairo — القاهرة</option><option value="Almarai">Almarai — المراعي</option></select></label>
        <label>شكل البطاقات<select value={theme.style} onChange={e=>set("style",e.target.value)}><option value="CLASSIC">كلاسيكي</option><option value="SQUARE">زوايا مستقيمة</option><option value="SOFT">زوايا دائرية</option></select></label>
        <button className={s.primary} disabled={busy}>{busy?"جارِ الحفظ…":"حفظ وتطبيق على الشركة"}</button>
      </fieldset>
      {message&&<p role="status">{message}</p>}
    </form>
    <ThemePreview theme={theme}/>
  </div>;
}
export function PlatformApp({token,onLogout}:{token:string;onLogout:()=>Promise<void>}) {
  const resource=useResource<{items:Company[]}>("/platform/companies",token);
  const [selectedId,setSelectedId]=useViewState<string|null>("platform:company",null);
  const selected=resource.data?.items.find(company=>company.id===selectedId) ?? null;
  const setSelected=(company:Company|null)=>setSelectedId(company?.id ?? null);
  const [creating,setCreating]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [access,setAccess]=useViewState("platform:access",false);
  const lock=useRef(false);
  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setMessage("");
    const form=e.currentTarget;const values=Object.fromEntries(new FormData(form));
    try{const result=await request<{id:string;name:string}>("/platform/companies",token,{method:"POST",body:JSON.stringify(values)});form.reset();setCreating(false);resource.reload();setAccess(false);setSelected({id:result.id,name:result.name,code:String(values.code),status:"ACTIVE",_count:{users:1,teams:0}});setMessage("تم إنشاء الشركة وحساب صاحبها. يمكنك الآن تخصيص هويتها.");}
    catch(e){setMessage(e instanceof Error?e.message:"تعذر إنشاء الشركة");}finally{setBusy(false);lock.current=false;}
  }
  return <main className={s.app}><aside className={s.sidebar}><h1>إدارة المنصة</h1><p>السوبر أدمن</p><button onClick={()=>{setSelected(null);setCreating(false);}}>الشركات</button><button onClick={()=>{setSelected(null);setCreating(true);setMessage("");}}>إضافة شركة</button><button onClick={()=>void onLogout()}>تسجيل الخروج</button></aside>
    <div className={s.main}><h1>{selected?selected.name:"الشركات وهوياتها"}</h1>{message&&<p role="status" className={s.card}>{message}</p>}
      {creating?<form onSubmit={create} className={s.card}><h2>إنشاء شركة وحساب صاحبها</h2><fieldset disabled={busy}>
        <label>اسم الشركة<input name="name" required maxLength={100}/></label><label>رمز الشركة (إنجليزي صغير)<input name="code" dir="ltr" required pattern="[a-z0-9][a-z0-9-]{1,39}" maxLength={40}/></label>
        <label>اسم صاحب الشركة<input name="ownerName" required maxLength={100}/></label><label>اسم الدخول<input name="username" dir="ltr" autoComplete="off" required pattern="[A-Za-z0-9._-]{3,80}" maxLength={80}/></label><label>كلمة المرور<input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={72}/></label>
        <button className={s.primary} disabled={busy}>{busy?"جارِ الإنشاء…":"إنشاء الشركة"}</button></fieldset><p>الحساب بصلاحيات إدارة الشركة الحالية. تجهيز المحافظات والفرق من لوحة صاحب الشركة.</p></form>
      :selected?<><div className={s.card}><button onClick={()=>setAccess(false)}>الهوية والثيم</button><button onClick={()=>setAccess(true)}>الأدوار والموظفون</button></div>{access?<div className={s.accessPanel}><CompanyAccess key={selected.id} token={token} path={`/platform/companies/${selected.id}/access`}/></div>:<BrandingEditor key={selected.id} company={selected} token={token}/>}</>
      :!resource.data?<ResourceState error={resource.error} retry={resource.reload}/>:<><p>لكل شركة بيانات وهوية مستقلة. يمكنك إدارة أدوار الشركة وموظفيها من إعداداتها.</p><div className={s.grid}>{resource.data.items.map(c=><article className={s.card} key={c.id}><h2>{c.name}</h2><p><bdi>{c.code}</bdi> • {c.status==="ACTIVE"?"فعالة":"غير فعالة"}</p><p>{c._count.users} حساب • {c._count.teams} فريق</p><button onClick={()=>{setAccess(false);setSelected(c);setMessage("");}}>تخصيص الهوية</button></article>)}</div></>}
    </div></main>;
}
