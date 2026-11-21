"use client";
import { useRef, useState, type FormEvent } from "react";
import { request } from "@/lib/api";
import type { ManagerWorkspace } from "./types";
import s from "./ManagerApp.module.css";
const weekdays=["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
export function CycleSettings({data,token,canEdit,onSaved,recurring=false}:{recurring?:boolean;data:ManagerWorkspace;token:string;canEdit:boolean;onSaved:()=>void}) {
  const [editHours,setEditHours]=useState(data.settings.roundEditWindowHours);
  const [startsOn,setStart]=useState(data.cycle?.startsOn??"");
  const [endsOn,setEnd]=useState(data.cycle?.endsOn??"");
  const [frequency,setFrequency]=useState(data.settings.frequency);
  const [workingDays,setDays]=useState(data.settings.workingDays.map(d=>({weekday:d.weekday,isWorking:d.isWorking})));
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const pending=useRef(false);
  async function save(e:FormEvent){
    e.preventDefault();if(pending.current||!data.cycle)return;pending.current=true;setBusy(true);setMessage("");
    try{await request(`/manager/cycles/${data.cycle.id}/settings`,token,{method:"PATCH",body:JSON.stringify({roundEditWindowHours:editHours,startsOn,endsOn,frequency:frequency.map(r=>({id:r.id,requiredVisits:r.requiredVisits})),workingDays})});setMessage("تم حفظ إعدادات السايكل. قواعد الزيارات للتكليفات الجديدة وأيام العمل الجديدة من الغد.");onSaved();}
    catch(e){setMessage(e instanceof Error?e.message:"تعذر الحفظ");}finally{pending.current=false;setBusy(false);}
  }
  return <form onSubmit={save}>
    <p className={s.notice}>{canEdit?"قواعد الزيارات الجديدة لا تعدّل أهداف التكليفات السابقة. تغييرات أيام العمل تبدأ من الغد في السايكل الجاري.":"إعدادات الشركة للعرض. التعديل لصاحب الشركة أو صاحب صلاحية إدارة السايكل."}</p>
    <div className={s.miniGrid}><section className={s.card}><h3>إعدادات الفترة الحالية</h3>{recurring&&<p>تواريخ هذه الفترة محفوظة. لتغيير الفترات التالية استخدم ضبط دورية السايكل.</p>}<label className={s.editorField}>مهلة تعديل الجولة بالساعات (0 لإيقاف التعديل)<input type="number" min={0} max={720} required disabled={!canEdit} value={editHours} onChange={e=>setEditHours(Number(e.target.value))}/></label>
      <label className={s.editorField}>بداية السايكل<input type="date" required disabled={!canEdit||recurring} value={startsOn} onChange={e=>setStart(e.target.value)}/></label>
      <label className={s.editorField}>نهاية السايكل<input type="date" required disabled={!canEdit} value={endsOn} onChange={e=>setEnd(e.target.value)}/></label>
      {frequency.map(r=><label className={s.editorField} key={r.id}>عدد زيارات {r.code}<input type="number" required min={1} max={365} disabled={!canEdit} value={r.requiredVisits} onChange={e=>setFrequency(rows=>rows.map(x=>x.id===r.id?{...x,requiredVisits:Number(e.target.value)}:x))}/></label>)}
    </section><section className={s.card}><h3>أيام العمل</h3>{[...workingDays].sort((a,b)=>a.weekday-b.weekday).map(d=><label className={s.editorField} key={d.weekday}><span><input type="checkbox" disabled={!canEdit} checked={d.isWorking} onChange={e=>setDays(days=>days.map(x=>x.weekday===d.weekday?{...x,isWorking:e.target.checked}:x))}/> {weekdays[d.weekday]} — {d.isWorking?"عمل":"عطلة"}</span></label>)}<h3>إعدادات الإجازات</h3><p>الرصيد السنوي الافتراضي: {data.settings.annualLeaveDays??"غير محدد"}</p></section></div>
    {message&&<p role="status" className={s.notice}>{message}</p>}
    {canEdit&&<button className={s.btn} disabled={busy||!data.cycle||!frequency.length||workingDays.length!==7}>{busy?"جارِ الحفظ…":"حفظ إعدادات السايكل وأيام العمل"}</button>}
  </form>;
}
