"use client";
import { useViewState } from "@/lib/view-state";
import { useRef, useState, type FormEvent } from 'react';
import { request, type Named, type SessionUser } from '@/lib/api';
import { useResource, ResourceState } from '../rep/useResource';
import { CompanyName, CompanyLogo } from '../platform/CompanyTheme';
import { ThemeIcon } from '../platform/ThemeIcon';
import { CycleSettings } from '../manager/CycleSettings';
import { TeamEditor } from '../manager/TeamEditor';
import { RepEditor } from '../manager/RepEditor';
import { TargetCatalog } from '../manager/TargetCatalog';
import { AreaCatalog } from '../manager/AreaCatalog';
import { ManagerAccountEditor, type ManagerEditChoice } from './ManagerAccountEditor';
import { CompanyAccess } from './CompanyAccess';
import { SalesWorkspace } from "../sales/SalesWorkspace";
import { CompanyCycles } from './CompanyCycles';
import { CompanyCatalog } from './CompanyCatalog';
import { CompanyCoverage } from './CompanyCoverage';
import { LeaveBalanceForm } from '../manager/LeaveBalanceEditor';
import type { ManagerWorkspace } from '../manager/types';
import s from '../manager/ManagerApp.module.css';
type Data = { provinces:(Named & {_count:{areas:number;teams:number}})[]; managers:(Named & {username:string})[]; teams:(Named & {province:Named|null;members:{user:Named}[];specialties:{specialty:Named}[];products:{product:Named}[]})[]; specialties:Named[];products:Named[];repCount:number;reps:(Named & {username:string;status:string;teamMemberships:{team:Named}[]})[] };
type Page='sales'|'cycles'|'access'|'dashboard'|'provinces'|'teams'|'settings'|'coverage'|'doctors'|'pharmacies'|'hospitals';
type Form='provinces'|'managers'|'teams';
export function CompanyApp({token,user,onLogout}:{token:string;user:SessionUser;onLogout:()=>Promise<void>}){
  const resource=useResource<Data>('/company/setup',token,15000),data=resource.data;
  const [page,setPage]=useViewState<Page>("company/CompanyApp.tsx:page", 'dashboard'),[form,setForm]=useState<Form|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[open,setOpen]=useState(false);
  const lock=useRef(false),dialog=useRef<HTMLDialogElement>(null);
  const [repEditor,setRepEditor]=useState<string|null>(null);
  const [editingTeam,setEditingTeam]=useState<string|null>(null);
  const [areaProvince,setAreaProvince]=useViewState("company/CompanyApp.tsx:areaProvince", '');
  const [targetSearch,setTargetSearch]=useViewState("company/CompanyApp.tsx:targetSearch", '');
  const [targetProvince,setTargetProvince]=useViewState("company/CompanyApp.tsx:targetProvince", '');
  const [managerEdit,setManagerEdit]=useState<ManagerEditChoice|null>(null);
  function show(kind:Form){setForm(kind);setMessage('');dialog.current?.showModal();}
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(lock.current||!form)return;lock.current=true;setBusy(true);setMessage('');
    const values=new FormData(e.currentTarget);const body:Record<string,unknown>=Object.fromEntries(values);
    if(form==='teams'){body.specialtyIds=values.getAll('specialtyIds');body.productIds=values.getAll('productIds');}
    try{await request(`/company/setup/${form}`,token,{method:'POST',body:JSON.stringify(body)});dialog.current?.close();setForm(null);resource.reload();setMessage(form==='teams'?'تم إنشاء الفريق وربطه بمديره ومحافظته.':form==='managers'?'تم إنشاء حساب المدير. اربطه بالمحافظة عند إنشاء الفريق.':'تمت إضافة المحافظة.');}
    catch(e){setMessage(e instanceof Error?e.message:'تعذر الحفظ.');}finally{setBusy(false);lock.current=false;}
  }
  return <main className={s.app}>
    {open&&<button className={s.sidebarBackdrop} aria-label="إغلاق القائمة" onClick={()=>setOpen(false)}/>}
    <aside className={`${s.sidebar} ${open?s.sidebarOpen:''}`}><button className={s.sidebarToggle} onClick={()=>setOpen(false)}>إغلاق القائمة</button><div className={s.brand}><span><CompanyLogo/></span><div><h2><CompanyName/></h2><p>مدير الشركة</p></div></div><nav className={s.menu}>{([['dashboard','الرئيسية','home'],['provinces','المحافظات','areas'],['teams','الفرق والمندوبون','teams'],['doctors','الأطباء','doctor'],['pharmacies','الصيدليات','pharmacy'],['hospitals','المشافي','hospital'],['coverage','تغطية المحافظات','target'],['sales','المبيعات','target'],['cycles','السايكل','target'],['settings','الإعدادات','settings'],['access','الأدوار والموظفون','teams']] as const).map(([id,label,icon])=><button className={page===id?s.active:''} key={id} onClick={()=>{setPage(id);setOpen(false);setMessage('');}}><span className={s.menuLabel}><ThemeIcon name={icon}/><b>{label}</b></span></button>)}</nav><div className={s.manager}><strong>{user.name}</strong><p>صاحب الشركة</p><button className={s.btn} onClick={()=>void onLogout()}>تسجيل الخروج</button></div></aside>
    <div className={s.main}><header className={s.topbar}><button className={s.sidebarToggle} onClick={()=>setOpen(true)}>القائمة</button><div><h1>{page==='sales'?'المبيعات':page==='access'?'الأدوار والموظفون':page==='dashboard'?'لوحة مدير الشركة':page==='provinces'?'المحافظات':page==='cycles'?'السايكل':page==='settings'?'الإعدادات':page==='coverage'?'تغطية المحافظات':page==='doctors'?'الأطباء':page==='pharmacies'?'الصيدليات':page==='hospitals'?'المشافي':'الفرق والمندوبون'}</h1><p>إدارة الشركة وتنظيم فرق المحافظات</p></div><button className={s.btn} onClick={resource.reload}>تحديث</button></header>
      <div className={s.content}>{message&&!form&&<p className={s.notice} role="status">{message}</p>}{!data?<ResourceState error={resource.error} retry={resource.reload}/>:<>
        {(page==='doctors'||page==='pharmacies'||page==='hospitals')&&<><label className={s.editorField}>المحافظة<select value={targetProvince} onChange={e=>{setTargetProvince(e.target.value);setTargetSearch('');}}><option value="">اختر المحافظة</option>{data.provinces.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{targetProvince?<><p className={s.notice}>العرض والإضافة والاستيراد ضمن محافظة {data.provinces.find(p=>p.id===targetProvince)?.name}. إذا تضمن الملف عمود City يجب أن يطابق هذه المحافظة.</p><label className={s.editorField}>بحث بالاسم<input value={targetSearch} onChange={e=>setTargetSearch(e.target.value)}/></label><TargetCatalog key={`${page}:${targetProvince}`} provinceId={targetProvince} type={page==='doctors'?'DOCTOR':page==='pharmacies'?'PHARMACY':'HOSPITAL'} token={token} canManage={user.permissions.includes('targets.manage')} search={targetSearch} areaId="" assignments={[]} catalogOnly onRefresh={resource.reload}/></>:<p className={s.empty}>اختر المحافظة لعرض الجهات وإضافتها أو استيرادها.</p>}</>}
        {page==='sales'&&<SalesWorkspace token={token} review/>}
        {page==='access'&&<CompanyAccess token={token}/>}
        {page==='coverage'&&<CompanyCoverage token={token}/>}
        {page==='dashboard'&&<button className={s.btn} onClick={()=>setPage('coverage')}>تغطية المحافظات</button>}
        {page==='teams'&&<CompanyReps reps={data.reps} onEdit={setRepEditor}/>}
        {page==='cycles'&&<CompanyCycles token={token} onSaved={resource.reload}/>}
        {page==='settings'&&<><CompanyCatalog token={token} specialties={data.specialties} products={data.products} onSaved={resource.reload}/><CompanySettings token={token} user={user}/></>}
        {page==='dashboard'&&<><section className={s.hero}><div><h2><CompanyName/></h2><p>ابدأ بالمحافظات، ثم أنشئ حسابات المدراء والفرق التابعة لها.</p></div></section><div className={s.statsRow}>{[[data.provinces.length,'المحافظات'],[data.teams.length,'الفرق'],[data.managers.length,'مدراء الفرق'],[data.repCount,'المندوبون']].map(([value,label])=><div key={label} className={`${s.card} ${s.smallStat}`}><span>{label}</span><strong>{value}</strong></div>)}</div><div className={s.editorActions}><button className={s.btn} onClick={()=>setPage('provinces')}>إدارة المحافظات</button><button className={s.btn} onClick={()=>setPage('teams')}>إدارة الفرق</button></div></>}
        {page==='provinces'&&<><div className={s.sectionHead}><h2>محافظات الشركة</h2><button className={s.btn} onClick={()=>show('provinces')}>+ إضافة محافظة</button></div><div className={s.cards}>{data.provinces.map(p=><article key={p.id} className={s.card}><h3>{p.name}</h3><p>{p._count.teams} فريق • {p._count.areas} منطقة</p><p>المدراء: {[...new Set(data.teams.filter(t=>t.province?.id===p.id).flatMap(t=>t.members.map(m=>m.user.name)))].join('، ')||'لم يُعيّن مدير لفريق بعد'}</p></article>)}</div>{!data.provinces.length&&<p className={s.empty}>لا توجد محافظات بعد. أضف أول محافظة.</p>}</>}
        {page==='teams'&&<><div className={s.sectionHead}><h2>الفرق ومدراؤها</h2><div className={s.editorActions}><button className={s.btn} onClick={()=>show('managers')}>+ إضافة مدير فريق</button><button className={s.btn} disabled={!data.provinces.length||!data.managers.length} onClick={()=>show('teams')}>+ إنشاء فريق</button></div></div>{(!data.provinces.length||!data.managers.length)&&<p className={s.notice}>إنشاء فريق يحتاج محافظة وحساب مدير فريق أولاً.</p>}<div className={s.cards}>{data.teams.map(t=><article className={s.card} key={t.id}><h3>{t.name}</h3><p>{t.province?.name??'بدون محافظة'}</p><p>المدير: {t.members.map(m=>m.user.name).join('، ')||'غير معيّن'}</p><p>الاختصاصات: {t.specialties.map(x=>x.specialty.name).join('، ')||'لم تُربط بعد'}</p><p>الأصناف: {t.products.map(x=>x.product.name).join('، ')||'لم تُربط بعد'}</p><button className={s.btn} onClick={()=>setEditingTeam(t.id)}>تعديل الفريق</button><button className={`${s.btn} ${s.secondary}`} onClick={()=>setManagerEdit({kind:"assignment",team:t})}>تغيير المدير</button></article>)}</div><h3>حسابات مدراء الفرق</h3><div className={`${s.card} ${s.tableCard}`}><table className={s.table}><thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الفرق</th><th>إدارة</th></tr></thead><tbody>{data.managers.map(m=><tr key={m.id}><td>{m.name}</td><td><bdi>{m.username}</bdi></td><td>{data.teams.filter(t=>t.members.some(x=>x.user.id===m.id)).map(t=>t.name).join('، ')||'لم يُربط بفريق بعد'}</td><td><button className={s.btn} onClick={()=>setManagerEdit({kind:'account',manager:m})}>تعديل الحساب</button></td></tr>)}</tbody></table></div></>}
        {page==='provinces'&&<section><h2>المناطق وحزم المناطق</h2><label className={s.editorField}>تصفية حسب المحافظة<select value={areaProvince} onChange={e=>setAreaProvince(e.target.value)}><option value="">كل المحافظات</option>{data.provinces.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><AreaCatalog token={token} canManage={user.permissions.includes('areas.manage')} metrics={[]} search="" areaId="" provinceId={areaProvince} onDetail={()=>{}} onRefresh={resource.reload}/></section>}
      </>}</div>
    </div>
    {managerEdit&&data&&<ManagerAccountEditor choice={managerEdit} managers={data.managers} token={token} onClose={()=>setManagerEdit(null)} onSaved={()=>{setManagerEdit(null);resource.reload();setMessage("تم حفظ التعديل.");}}/>}
    {editingTeam&&<TeamEditor teamId={editingTeam} mode="settings" token={token} onClose={()=>setEditingTeam(null)} onSaved={()=>{setEditingTeam(null);resource.reload();setMessage("تم حفظ إعدادات الفريق. يمكنك الآن تعديل تكليف المندوب.");}}/>}
    {repEditor!==null&&<RepEditor key={repEditor||'new'} token={token} repId={repEditor||undefined} onClose={()=>setRepEditor(null)} onSaved={text=>{setRepEditor(null);setMessage(text);resource.reload();}}/>}
    <dialog className={`${s.dialog} ${s.editorDialog}`} ref={dialog} onCancel={e=>{if(busy)e.preventDefault();else setForm(null);}}>{form&&data&&<form key={form} onSubmit={submit} className={s.companyForm}><h2>{form==='provinces'?'إضافة محافظة':form==='managers'?'إضافة مدير فريق':'إنشاء فريق'}</h2><fieldset disabled={busy} style={{border:0,display:'grid',gap:16}}>
      <label>الاسم<input name="name" required maxLength={120}/></label>
      {form==='managers'&&<><label>اسم الدخول<input name="username" required pattern="[A-Za-z0-9._-]{3,80}" dir="ltr" autoComplete="off"/></label><label>كلمة المرور<input name="password" type="password" minLength={10} maxLength={72} required autoComplete="new-password"/></label></>}
      {form==='teams'&&<><label>المحافظة<select name="provinceId" required defaultValue=""><option value="" disabled>اختر المحافظة</option>{data.provinces.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>مدير الفريق<select name="managerId" required defaultValue=""><option value="" disabled>اختر المدير</option>{data.managers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><div className={s.companyChoices}><strong>الاختصاصات</strong>{data.specialties.length?data.specialties.map(v=><label key={v.id}><input type="checkbox" name="specialtyIds" value={v.id}/>{v.name}</label>):<p>لا توجد اختصاصات بكتالوج الشركة بعد.</p>}</div><div className={s.companyChoices}><strong>الأصناف</strong>{data.products.length?data.products.map(v=><label key={v.id}><input type="checkbox" name="productIds" value={v.id}/>{v.name}</label>):<p>لا توجد أصناف بكتالوج الشركة بعد.</p>}</div></>}
      <div className={s.editorActions}><button className={s.btn} disabled={busy}>{busy?'جارِ الحفظ…':'حفظ'}</button><button type="button" className={`${s.btn} ${s.secondary}`} onClick={()=>{dialog.current?.close();setForm(null);setMessage('');}}>إلغاء</button></div></fieldset>{message&&<p className={s.error} role="alert">{message}</p>}</form>}</dialog>
  </main>;
}

function CompanySettings({token,user}:{token:string;user:SessionUser}) {
  const resource=useResource<ManagerWorkspace>('/manager/workspace',token);
  const schedule=useResource<{schedule:unknown}>('/company/setup/cycle-schedule',token);
  if(!resource.data)return <ResourceState error={resource.error} retry={resource.reload}/>;
  return <><CycleSettings recurring={!!schedule.data?.schedule} data={resource.data} token={token} canEdit={user.permissions.includes('cycles.configure')} onSaved={resource.reload}/>{user.permissions.includes('leaves.configure')&&resource.data.settings.annualLeaveDays!==null&&<LeaveBalanceForm token={token} path="/manager/leave-default" initial={resource.data.settings.annualLeaveDays} onSaved={resource.reload}/>}</>;
}

function CompanyReps({reps,onEdit}:{reps:Data['reps'];onEdit:(id:string)=>void}) {
  return <><div className={s.sectionHead}><h2>المندوبون</h2><button className={s.btn} onClick={()=>onEdit('')}>+ إضافة مندوب</button></div><div className={`${s.card} ${s.tableCard}`}><table className={s.table}><thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الفرق</th><th>الحالة</th><th>إدارة</th></tr></thead><tbody>{reps.map(r=><tr key={r.id}><td>{r.name}</td><td><bdi>{r.username}</bdi></td><td>{r.teamMemberships.map(m=>m.team.name).join('، ')||'بدون فريق'}</td><td>{r.status==='ACTIVE'?'نشط':'غير نشط'}</td><td><button className={s.btn} onClick={()=>onEdit(r.id)}>تعديل</button></td></tr>)}</tbody></table>{!reps.length&&<p className={s.empty}>لا يوجد مندوبون بعد.</p>}</div></>;
}
