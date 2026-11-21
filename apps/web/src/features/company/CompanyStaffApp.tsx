"use client";
import { useViewState } from "@/lib/view-state";
import { useRef, useState, type FormEvent } from 'react';
import { request, type Named, type SessionUser } from '@/lib/api';
import { ResourceState, useResource } from '../rep/useResource';
import { CompanyLogo, CompanyName } from '../platform/CompanyTheme';
import { ThemeIcon } from '../platform/ThemeIcon';
import { TargetCatalog } from '../manager/TargetCatalog';
import { AreaCatalog } from '../manager/AreaCatalog';
import { CompanyCatalog } from './CompanyCatalog';
import { CompanyCoverage } from './CompanyCoverage';
import s from '../manager/ManagerApp.module.css';
type Data={permissions:string[];specialties:Named[];products:Named[]};
const pages=[['doctors','الأطباء','doctor','targets.view'],['pharmacies','الصيدليات','pharmacy','targets.view'],['hospitals','المشافي','hospital','targets.view'],['areas','المحافظات والمناطق','areas','areas.view'],['catalog','الاختصاصات والأصناف','settings','catalog'],['coverage','تغطية المحافظات','target','analytics.view_national']] as const;
export function CompanyStaffApp({token,user,onLogout}:{token:string;user:SessionUser;onLogout:()=>Promise<void>}){
  const resource=useResource<Data>('/company/staff-workspace',token,15000),data=resource.data;
  const [selected,setSelected]=useViewState("company/CompanyStaffApp.tsx:selected", ''),[open,setOpen]=useState(false),[search,setSearch]=useViewState("company/CompanyStaffApp.tsx:search", '');
  const allowed=pages.filter(p=>p[3]==='catalog'?data?.permissions.some(v=>['specialties.view','products.view'].includes(v)):data?.permissions.includes(p[3]));
  const page=allowed.find(p=>p[0]===selected)??allowed[0];
  const can=(permission:string)=>!!data?.permissions.includes(permission);
  return <main className={s.app}>{open&&<button className={s.sidebarBackdrop} aria-label="إغلاق القائمة" onClick={()=>setOpen(false)}/>}<aside className={`${s.sidebar} ${open?s.sidebarOpen:''}`}><button className={s.sidebarToggle} onClick={()=>setOpen(false)}>إغلاق القائمة</button><div className={s.brand}><span><CompanyLogo/></span><div><h2><CompanyName/></h2><p>إدارة بيانات الشركة</p></div></div><nav className={s.menu}>{allowed.map(([id,label,icon])=><button key={id} className={page?.[0]===id?s.active:''} onClick={()=>{setSelected(id);setSearch('');setOpen(false);}}><span className={s.menuLabel}><ThemeIcon name={icon}/><b>{label}</b></span></button>)}</nav><div className={s.manager}><strong>{user.name}</strong><button className={s.btn} onClick={()=>void onLogout()}>تسجيل الخروج</button></div></aside><div className={s.main}><header className={s.topbar}><button className={s.sidebarToggle} onClick={()=>setOpen(true)}>القائمة</button><div><h1>{page?.[1]??'صلاحيات الحساب'}</h1><p>الأقسام المتاحة حسب دورك في الشركة</p></div><button className={s.btn} onClick={resource.reload}>تحديث</button></header><div className={s.content}>{!data?<ResourceState error={resource.error} retry={resource.reload}/>:!page?<p className={s.empty}>لا توجد صلاحيات تشغيلية مخصصة لحسابك. راجع صاحب الشركة.</p>:<div key={`${page[0]}:${data.permissions.join(',')}`}>
    {['doctors','pharmacies','hospitals'].includes(page[0])&&<><label className={s.editorField}>بحث بالاسم<input value={search} onChange={e=>setSearch(e.target.value)}/></label><TargetCatalog token={token} type={page[0]==='doctors'?'DOCTOR':page[0]==='pharmacies'?'PHARMACY':'HOSPITAL'} canManage={can('targets.manage')} search={search} areaId="" assignments={[]} catalogOnly onRefresh={resource.reload}/></>}
    {page[0]==='areas'&&<>{can('areas.manage')&&<ProvinceForm token={token} onSaved={resource.reload}/>}<AreaCatalog token={token} canManage={can('areas.manage')} metrics={[]} search="" areaId="" onDetail={()=>{}} onRefresh={resource.reload}/></>}
    {page[0]==='catalog'&&<CompanyCatalog token={token} specialties={data.specialties} products={data.products} permissions={data.permissions} onSaved={resource.reload}/>}
    {page[0]==='coverage'&&<CompanyCoverage token={token}/>}
    </div>}</div></div></main>;
}
function ProvinceForm({token,onSaved}:{token:string;onSaved:()=>void}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');const lock=useRef(false);
  async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();if(lock.current)return;const form=e.currentTarget;const name=String(new FormData(form).get('name')??'');lock.current=true;setBusy(true);setError('');try{await request('/company/setup/provinces',token,{method:'POST',body:JSON.stringify({name})});onSaved();}catch(e){setError(e instanceof Error?e.message:'تعذر الحفظ.');}finally{lock.current=false;setBusy(false);}}
  return <form onSubmit={save} className={s.card}><h2>إضافة محافظة</h2><label className={s.editorField}>اسم المحافظة<input name="name" required maxLength={120} disabled={busy}/></label><button className={s.btn} disabled={busy}>{busy?'جارِ الحفظ…':'إضافة محافظة'}</button>{error&&<p role="alert" className={s.error}>{error}</p>}</form>;
}
