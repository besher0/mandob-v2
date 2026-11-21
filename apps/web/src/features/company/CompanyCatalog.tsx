"use client";
import { useRef, useState, type FormEvent } from 'react';
import { request, type Named } from '@/lib/api';
import s from '../manager/ManagerApp.module.css';
export function CompanyCatalog({token,specialties,products,onSaved,permissions}:{token:string;specialties:Named[];products:Named[];onSaved:()=>void;permissions?:string[]}) {
  const [editing,setEditing]=useState<{kind:'specialties'|'products';item?:Named}|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const dialog=useRef<HTMLDialogElement>(null),pending=useRef(false);
  function open(kind:'specialties'|'products',item?:Named){setEditing({kind,item});setError('');setMessage('');dialog.current?.showModal();}
  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!editing||pending.current)return;
    const name=String(new FormData(e.currentTarget).get('name')??'').trim();
    if(!name){setError('الاسم مطلوب.');return;}
    pending.current=true;setBusy(true);setError('');
    try{await request(`/company/setup/${editing.kind}${editing.item?`/${editing.item.id}`:''}`,token,{method:editing.item?'PATCH':'POST',body:JSON.stringify({name})});dialog.current?.close();setEditing(null);setMessage('تم الحفظ. البيانات متاحة الآن عند تعديل الفريق.');onSaved();}
    catch(e){setError(e instanceof Error?e.message:'تعذر الحفظ.');}finally{pending.current=false;setBusy(false);}
  }
  return <><h2>بيانات الشركة</h2>{message&&<p className={s.notice} role="status">{message}</p>}<div className={s.cards}>{([['specialties','الاختصاصات',specialties],['products','الأصناف',products]] as const).filter(([kind])=>!permissions||permissions.includes(`${kind}.view`)).map(([kind,title,items])=><section className={s.card} key={kind}><div className={s.sectionHead}><h3>{title}</h3>{(!permissions||permissions.includes(`${kind}.manage`))&&<button className={s.btn} onClick={()=>open(kind)}>إضافة {kind==='specialties'?'اختصاص':'صنف'}</button>}</div>{items.length?<table className={s.table}><thead><tr><th>الاسم</th><th>إدارة</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{item.name}</td><td>{(!permissions||permissions.includes(`${kind}.manage`))&&<button className={s.btn} onClick={()=>open(kind,item)}>تعديل {item.name}</button>}</td></tr>)}</tbody></table>:<p className={s.empty}>لم تُضف {title} بعد.</p>}</section>)}</div><dialog ref={dialog} className={`${s.dialog} ${s.editorDialog}`} onCancel={e=>{if(busy)e.preventDefault();else setEditing(null);}}>{editing&&<form key={`${editing.kind}:${editing.item?.id??'new'}`} onSubmit={save} className={s.companyForm}><h3>{editing.item?'تعديل':'إضافة'} {editing.kind==='specialties'?'اختصاص':'صنف'}</h3><label>الاسم<input name="name" required maxLength={120} defaultValue={editing.item?.name??''} disabled={busy}/></label>{error&&<p className={s.error} role="alert">{error}</p>}<div className={s.editorActions}><button className={s.btn} disabled={busy}>{busy?'جارِ الحفظ…':'حفظ'}</button><button type="button" className={`${s.btn} ${s.secondary}`} disabled={busy} onClick={()=>{dialog.current?.close();setEditing(null);}}>إلغاء</button></div></form>}</dialog></>;
}
