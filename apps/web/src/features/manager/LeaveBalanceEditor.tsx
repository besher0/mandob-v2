"use client";
import { useRef,useState,type FormEvent } from "react";
import { request } from "@/lib/api";
import { useResource, ResourceState } from "../rep/useResource";
import s from "./ManagerApp.module.css";
type Balance={year:number;allocatedDays:number;carriedDays:number;adjustmentDays:number;remainingDays:number};
export function LeaveBalanceForm({token,path,initial,details,onSaved}:{token:string;path:string;initial:number;details?:Balance;onSaved:()=>void}) {
 const [days,setDays]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState("");const pending=useRef(false);
 async function save(e:FormEvent){e.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setMessage("");try{await request(path,token,{method:"PATCH",body:JSON.stringify({allocatedDays:days})});setMessage("تم حفظ الاستحقاق.");onSaved();}catch(e){setMessage(e instanceof Error?e.message:"تعذر الحفظ");}finally{pending.current=false;setBusy(false);}}
 return <form onSubmit={save} className={s.card}><h3>{details?`رصيد إجازات المندوب — ${details.year}`:"الرصيد السنوي الافتراضي للشركة"}</h3><label className={s.editorField}>الاستحقاق السنوي بالأيام<input type="number" min={0} max={366} step={0.5} required value={days} onChange={e=>setDays(Number(e.target.value))}/></label>{details?<p>الرصيد المتبقي: {details.remainingDays} يوم • المرحّل: {details.carriedDays} • التسويات: {details.adjustmentDays}</p>:<p className={s.muted}>يطبق على المندوبين الذين ليس لهم استحقاق سنوي مخصص. الإجازات الموافق عليها تبقى محسوبة.</p>}<button className={s.btn} disabled={busy}>{busy?"جارِ الحفظ…":"حفظ الرصيد"}</button>{message&&<p role="status">{message}</p>}</form>;
}
export function RepLeaveBalance({token,repId}:{token:string;repId:string}) {
 const path=`/manager/reps/${repId}/leave-balance`;const r=useResource<Balance>(path,token);
 return !r.data?<ResourceState error={r.error} retry={r.reload}/>:<LeaveBalanceForm token={token} path={path} initial={r.data.allocatedDays} details={r.data} onSaved={r.reload}/>;
}
