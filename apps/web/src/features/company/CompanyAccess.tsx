"use client";
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { request } from '@/lib/api';
import { ResourceState, useResource } from '../rep/useResource';
import s from '../manager/ManagerApp.module.css';
type Choice = {id:string;name:string;requires:string[]};
type Role = {id:string;name:string;revision:number;permissionIds:string[];staffCount:number};
type Staff = {id:string;name:string;username:string;status:string;updatedAt:string;roleId:string};
type Data = {permissions:Choice[];roles:Role[];staff:Staff[]};
type Editing = {kind:'role';item?:Role}|{kind:'staff';item?:Staff};
export function CompanyAccess({token,path='/company/access'}:{token:string;path?:string}) {
  const resource=useResource<Data>(path,token);
  const [editing,setEditing]=useState<Editing|null>(null),[message,setMessage]=useState('');
  const data=resource.data;
  if(!data)return <ResourceState error={resource.error} retry={resource.reload}/>;
  return <section>
    <div className={s.sectionHead}><h2>الأدوار والموظفون</h2><button className={s.btn} onClick={resource.reload}>تحديث</button></div>
    <p>أنشئ دوراً بصلاحيات محددة، ثم اربطه بحساب الموظف. التفويض يشمل بيانات هذه الشركة فقط، وإدارة الأدوار تبقى لصاحب الشركة والسوبر أدمن.</p>
    {message&&<p className={s.notice} role="status">{message}</p>}
    <div className={s.sectionHead}><h3>الأدوار</h3><button className={s.btn} onClick={()=>setEditing({kind:'role'})}>إضافة دور</button></div>
    <div className={s.cards}>{data.roles.map(r=><article key={r.id} className={s.card}><h3>{r.name}</h3><p>{r.staffCount} موظف</p><ul>{data.permissions.filter(p=>r.permissionIds.includes(p.id)).map(p=><li key={p.id}>{p.name}</li>)}</ul>{!r.permissionIds.length&&<p>بلا صلاحيات تشغيلية</p>}<button className={s.btn} onClick={()=>setEditing({kind:'role',item:r})}>تعديل {r.name}</button></article>)}</div>
    {!data.roles.length&&<p className={s.empty}>لا توجد أدوار مخصصة بعد.</p>}
    <div className={s.sectionHead}><h3>الموظفون المفوّضون</h3><button className={s.btn} disabled={!data.roles.length} onClick={()=>setEditing({kind:'staff'})}>إضافة موظف</button></div>
    <div className={`${s.card} ${s.tableCard}`}><table className={s.table}><thead><tr><th>الاسم</th><th>اسم الدخول</th><th>الدور</th><th>الحالة</th><th>إدارة</th></tr></thead><tbody>{data.staff.map(u=><tr key={u.id}><td>{u.name}</td><td><bdi>{u.username}</bdi></td><td>{data.roles.find(r=>r.id===u.roleId)?.name??'غير معيّن'}</td><td>{u.status==='ACTIVE'?'نشط':'موقوف'}</td><td><button className={s.btn} onClick={()=>setEditing({kind:'staff',item:u})}>تعديل {u.name}</button></td></tr>)}</tbody></table>{!data.staff.length&&<p className={s.empty}>لا توجد حسابات موظفين مفوّضين بعد.</p>}</div>
    {editing&&<AccessEditor token={token} path={path} editing={editing} data={data} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);setMessage('تم الحفظ. الصلاحيات الجديدة تسري على طلبات الموظف التالية.');resource.reload();}}/>}
  </section>;
}
function AccessEditor({token,path,editing,data,onClose,onSaved}:{token:string;path:string;editing:Editing;data:Data;onClose:()=>void;onSaved:()=>void}) {
  const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const [selected,setSelected]=useState<string[]>(editing.kind==='role'?editing.item?.permissionIds??[]:[]);
  useEffect(()=>{dialog.current?.showModal();},[]);
  const effective=new Set(selected.flatMap(id=>[id,...(data.permissions.find(p=>p.id===id)?.requires??[])]));
  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError('');
    const values=Object.fromEntries(new FormData(e.currentTarget));
    const body=editing.kind==='role'?{name:values.name,permissionIds:selected,...(editing.item?{revision:editing.item.revision}:{})}:{...values,...(editing.item?{expectedUpdatedAt:editing.item.updatedAt}:{})};
    try{await request(`${path}/${editing.kind==='role'?'roles':'staff'}${editing.item?`/${editing.item.id}`:''}`,token,{method:editing.item?'PATCH':'POST',body:JSON.stringify(body)});onSaved();}
    catch(e){setError(e instanceof Error?e.message:'تعذر الحفظ.');}finally{lock.current=false;setBusy(false);}
  }
  return <dialog ref={dialog} className={`${s.dialog} ${s.editorDialog}`} onCancel={e=>{if(busy)e.preventDefault();else onClose();}}><form onSubmit={save} className={s.companyForm}><h2>{editing.item?'تعديل':'إضافة'} {editing.kind==='role'?'دور':'موظف'}</h2><fieldset disabled={busy} style={{border:0,display:'grid',gap:16}}><label>الاسم<input name="name" required maxLength={120} defaultValue={editing.item?.name??''}/></label>
    {editing.kind==='role'?<><p>الصلاحيات على مستوى الشركة. اختيار التعديل يشمل العرض والبيانات اللازمة له تلقائياً.</p><div className={s.companyChoices}>{data.permissions.map(p=>{const inherited=!selected.includes(p.id)&&effective.has(p.id);return <label key={p.id}><input type="checkbox" checked={effective.has(p.id)} disabled={inherited} onChange={e=>setSelected(previous=>e.target.checked?[...previous,p.id]:previous.filter(id=>id!==p.id))}/>{p.name}{inherited?' (مطلوبة لصلاحية أخرى)':''}</label>;})}</div></>:<><label>اسم الدخول<input name="username" dir="ltr" required pattern="[A-Za-z0-9._-]{3,80}" maxLength={80} autoComplete="off" defaultValue={editing.item?.username??''}/></label>{!editing.item&&<label>كلمة المرور<input name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password"/></label>}<label>الدور<select name="roleId" required defaultValue={editing.item?.roleId??''}><option value="" disabled>اختر الدور</option>{data.roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{editing.item&&<label>الحالة<select name="status" defaultValue={editing.item.status==='ACTIVE'?'ACTIVE':'SUSPENDED'}><option value="ACTIVE">نشط</option><option value="SUSPENDED">موقوف</option></select></label>}</>}
    <div className={s.editorActions}><button className={s.btn}>{busy?'جارِ الحفظ…':'حفظ'}</button><button type="button" className={`${s.btn} ${s.secondary}`} onClick={onClose}>إلغاء</button></div></fieldset>{error&&<p className={s.error} role="alert">{error}</p>}</form></dialog>;
}
