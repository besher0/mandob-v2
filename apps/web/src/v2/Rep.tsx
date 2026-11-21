import React, {useEffect, useMemo, useState} from 'react';
import {CurrentUser, request, write} from './api';
import {Action, ArrayList, Done, Empty, Failure, Metric, Notice, Section, SelectMany, Wait, dateText, today, useRemote} from './ui';

type Props = {user: CurrentUser; page: string; revision: number; go: (page: string) => void; preselectedArea?: string | null; update: () => void};
const kinds = {DOCTOR:'الأطباء', PHARMACY:'الصيدليات', HOSPITAL:'المشافي'};
const statuses: Record<string,string> = {PENDING:'قيد المراجعة', APPROVED:'مقبول', REJECTED:'مرفوض', ANNUAL:'سنوية', SICK:'مرضية', EMERGENCY:'طارئة', UNPAID:'بلا أجر'};

function RepHome({go, revision}: Props) {
  const dashboard = useRemote('/rep/dashboard', revision);
  const workspace = useRemote('/rep/workspace', revision);
  const d = dashboard.data || {};
  const w = workspace.data || {};
  return <div className="rep-home v2-rep-home">
    <div className="rep-hero"><h2>مرحباً، {d.rep?.name || 'بك'}</h2><p>متابعة الزيارات والتغطية خلال السايكل الحالي</p>
      <div className="rep-hero-metrics">
        <div><span>تغطية السايكل</span><strong>{d.cycleProgress?.coveragePercent ?? 0}%</strong></div>
        <div><span>زيارات الأسبوع</span><strong>{d.weeklySummary?.completedVisits ?? d.weeklySummary?.totalVisits ?? 0}</strong></div>
        <div><span>المتبقي</span><strong>{w.cycle?.remainingDays ?? '—'} يوم</strong></div>
        <div><span>الفريق</span><strong>{d.rep?.teams?.map((x: any) => x.name).join('، ') || d.rep?.team?.name || '—'}</strong></div>
      </div>
    </div>
    <Wait state={dashboard}/><Wait state={workspace}/>
    <Section title="مساحة العمل"><div className="v2-quick-grid">
      {[['DOCTOR','الأطباء','doctors'],['PHARMACY','الصيدليات','pharmacies'],['HOSPITAL','المشافي','hospitals']].map(([kind,title,key]) => {
        const stats = w.summary?.[key] || {};
        return <button type="button" key={kind} className="v2-shortcut" onClick={() => go(key)}>
          <strong>{title}</strong><span>{stats.total ?? '—'} إجمالي</span><span>{stats.unvisited ?? '—'} غير مزار/بحاجة زيارة</span>
        </button>;
      })}
      <button type="button" className="v2-shortcut" onClick={() => go('plan')}><strong>الخطة والأصناف</strong><span>{w.products?.length ?? 0} أصناف</span><span>{w.cycle?.remainingDays ?? '—'} يوم متبقٍ</span></button>
    </div></Section>
    <Section title="تنبيهات"><div className="stats">
      <Metric label="أطباء A غير المزارين" value={d.overdueDoctors?.total ?? '—'}/>
      <Metric label="الأهداف المكتملة" value={d.cycleProgress?.completedTargets ?? '—'}/>
    </div><Action onClick={() => go('analytics')}>عرض التحليل</Action></Section>
    <div className="v2-action-bar"><Action onClick={() => go('round')}>+ ابدأ جولة</Action></div>
  </div>;
}
function RepPlan({revision}: {revision:number}) {
  const state = useRemote('/rep/workspace', revision), w = state.data || {};
  return <><Wait state={state}/><Section title="الخطة والأصناف"><div className="stats">
    <Metric label="السايكل" value={w.cycle?.name || 'غير محدد'}/>
    <Metric label="الأيام المتبقية" value={w.cycle?.remainingDays}/>
    <Metric label="هدف أطباء A" value={w.plan?.aCoverageTarget ?? '—'}/>
  </div><p>{w.plan?.managerInstructions || 'لا توجد تعليمات مضافة من الإدارة.'}</p>
  <ArrayList items={w.products || []} columns={[
    {label:'الصنف', show:x=>x.name},
    {label:'الأولوية', show:x=>x.priority ?? '—'},
    {label:'التوجيهات', show:x=>x.guidance || '—'}
  ]}/></Section></>;
}
function RepAreas({revision,goArea}: {revision:number;goArea:(id:string)=>void}) {
  const state=useRemote('/rep/workspace',revision);
  const [search,setSearch]=useState('');
  const areas=(state.data?.areas || []).filter((x:any)=>x.name.includes(search.trim()));
  return <><Wait state={state}/><Section title="مناطقي"><input aria-label="ابحث عن منطقة" placeholder="ابحث عن منطقة" value={search} onChange={e=>setSearch(e.target.value)}/>
    <div className="v2-quick-grid">{areas.map((area:any)=><div className="mini-card" key={area.id}>
      <h3>{area.name}</h3><p>{area.total ?? 0} أطباء • {area.unvisited ?? 0} غير مزارين</p>
      <p>التغطية: {area.coverage ?? 0}%</p><Action onClick={()=>goArea(area.id)}>جولة من المنطقة</Action>
    </div>)}</div>{!areas.length&&!state.loading&&<Empty title="لا توجد مناطق متاحة ضمن صلاحيات حسابك"/>}
  </Section></>;
}
function RepTargets({type,revision}: {type:'DOCTOR'|'PHARMACY'|'HOSPITAL';revision:number}) {
  const catalog=useRemote('/rep/workspace',revision);
  const [search,setSearch]=useState(''),[areaIds,setAreaIds]=useState<string[]>([]);
  const [classIds,setClassIds]=useState<string[]>([]),[specialtyIds,setSpecialtyIds]=useState<string[]>([]);
  const [unvisited,setUnvisited]=useState(false),[page,setPage]=useState(0);
  const path=useMemo(()=>{
    const p=new URLSearchParams({type});
    if(search.trim())p.set('search',search.trim());
    if(areaIds.length)p.set('areaIds',areaIds.join(','));
    if(classIds.length)p.set('classIds',classIds.join(','));
    if(specialtyIds.length)p.set('specialtyIds',specialtyIds.join(','));
    if(unvisited)p.set('unvisited','true');
    return '/rep/targets?'+p.toString();
  },[type,search,areaIds,classIds,specialtyIds,unvisited]);
  const data=useRemote(path,revision);
  const items=data.data?.items || [];
  const pageSize=50;
  return <><Section title={kinds[type]}><div className="v2-filter-bar">
    <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} placeholder="بحث بالاسم…" aria-label="بحث عن جهة"/>
    <label><input type="checkbox" checked={unvisited} onChange={e=>{setUnvisited(e.target.checked);setPage(0)}}/> غير مزار</label>
  </div><SelectMany label="المناطق" items={catalog.data?.areas || []} selected={areaIds} onChange={v=>{setAreaIds(v);setPage(0)}}/>
  <SelectMany label="التصنيف" items={(catalog.data?.classes || []).map((x:any)=>({id:x.id,name:x.code||x.name}))} selected={classIds} onChange={v=>{setClassIds(v);setPage(0)}}/>
  {type==='DOCTOR'&&<SelectMany label="الاختصاصات" items={catalog.data?.specialties || []} selected={specialtyIds} onChange={v=>{setSpecialtyIds(v);setPage(0)}}/>}
  <div className="v2-chips">{[...areaIds,...classIds,...specialtyIds].length>0&&<button type="button" className="btn" onClick={()=>{setAreaIds([]);setClassIds([]);setSpecialtyIds([]);setUnvisited(false);setPage(0)}}>مسح الفلاتر ({areaIds.length+classIds.length+specialtyIds.length})</button>}</div>
  <Wait state={catalog}/><Wait state={data}/>
  <ArrayList items={items.slice(page*pageSize,(page+1)*pageSize)} columns={[
    {label:'الاسم',show:x=>x.name},
    {label:'التصنيف',show:x=>x.class?.code || '—'},
    {label:'المنطقة',show:x=>x.locations?.map((l:any)=>l.areaName).join('، ') || '—'},
    {label:'الزيارات',show:x=>(x.completedVisits ?? 0)+' / '+(x.requiredVisits ?? 0)},
    {label:'آخر زيارة',show:x=>dateText(x.lastVisit)},
    {label:'الحالة',show:x=>x.status}
  ]}/>
  <div className="v2-pagination"><button className="btn" type="button" disabled={!page} onClick={()=>setPage(page-1)}>السابق</button>
    <span>صفحة {page+1} من {Math.max(1,Math.ceil(items.length/pageSize))}</span>
    <button className="btn" type="button" disabled={(page+1)*pageSize>=items.length} onClick={()=>setPage(page+1)}>التالي</button>
  </div></Section></>;
}
function NewRound({revision,go,preselectedArea,editRoundId,update}: {revision:number;go:(s:string)=>void;preselectedArea?:string|null;editRoundId?:string|null;update:()=>void}) {
  const catalog=useRemote('/rep/workspace',revision);
  const editDetails=useRemote(editRoundId?'/rep/rounds/'+encodeURIComponent(editRoundId)+'/edit':null,revision);
  const [type,setType]=useState<'DOCTOR'|'PHARMACY'|'HOSPITAL'>('DOCTOR');
  const [areas,setAreas]=useState<string[]>(preselectedArea?[preselectedArea]:[]);
  const [targets,setTargets]=useState<string[]>([]);
  const [products,setProducts]=useState<string[]>([]);
  const [visitDate,setVisitDate]=useState(today());
  const [notes,setNotes]=useState('');
  const [stage,setStage]=useState(0),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[done,setDone]=useState('');
  const [retry,setRetry]=useState<{signature:string;payload:any}|null>(null);
  const state=useRemote('/rep/targets?type='+type,revision);
  const eligible=(state.data?.items||[]).filter((t:any)=>t.locations?.some((l:any)=>areas.includes(l.areaId)));
  const allowed=new Set(eligible.map((t:any)=>t.id));
  const selectedTargets=targets.filter(id=>allowed.has(id));
  useEffect(()=>{if(preselectedArea)setAreas([preselectedArea]);},[preselectedArea]);
  useEffect(()=>{
    const detail=editDetails.data;
    if(!detail||!editRoundId)return;
    setType(detail.type);setAreas(detail.areaIds||[]);
    setTargets((detail.targets||[]).map((t:any)=>t.id));setProducts(detail.productIds||[]);
    setVisitDate(detail.visitDate);setNotes(detail.notes||'');setStage(3);setRetry(null);
  },[editDetails.data,editRoundId]);
  function selectAreas(value:string[]) {setAreas(value);setTargets([]);setRetry(null);}
  function selectTargets(value:string[]) {setTargets(value);setRetry(null);}
  async function submit() {
    if(!catalog.data?.cycle?.id){setError('لا يوجد سايكل فعال.');return;}
    if(!areas.length||!selectedTargets.length){setError('حدد منطقة وجهة واحدة على الأقل.');return;}
    if(visitDate>today()){setError('لا يمكن اختيار تاريخ مستقبلي.');return;}
    setBusy(true);setError('');setDone('');
    try {
      const signature=JSON.stringify({cycleId:catalog.data.cycle.id,type,areaIds:[...areas].sort(),targetIds:[...selectedTargets].sort(),productIds:[...products].sort(),visitDate,notes});
      let payload=retry?.signature===signature?retry.payload:null;
      if(!payload){
        const policy=catalog.data.roundLocationPolicy || 'DISABLED';
        let location:any={};
        if(!editRoundId&&policy!=='DISABLED'){
          try {
            const fix=await new Promise<GeolocationPosition>((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:20000,maximumAge:0}));
            location={latitude:fix.coords.latitude,longitude:fix.coords.longitude,accuracy:fix.coords.accuracy,locationCapturedAt:new Date(fix.timestamp).toISOString()};
          }catch(e:any){
            if(policy==='REQUIRED')throw new Error('لا يمكن حفظ الجولة قبل تحديد الموقع. فعّل GPS وأعد المحاولة.');
            location={locationReason:'GPS_UNAVAILABLE'};
          }
        }
        payload={clientRef:crypto.randomUUID(),cycleId:catalog.data.cycle.id,type,areaIds:areas,targetIds:selectedTargets,productIds:products,visitDate,notes,...location};
        setRetry({signature,payload});
      }
      const result=editRoundId
        ? await write('/rep/rounds/'+encodeURIComponent(editRoundId),{...payload,revision:editDetails.data.revision},'PATCH')
        : await write('/rep/rounds',payload);
      setDone((editRoundId?'تم تعديل':'تم تسجيل')+' الجولة، عدد الزيارات: '+(result.visitCount??selectedTargets.length));
      setRetry(null);update();setTimeout(()=>go('history'),500);
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <Section title={editRoundId?'تعديل الجولة':'ابدأ جولة جديدة'}><Wait state={catalog}/><Wait state={state}/><Wait state={editDetails}/>
    <div className="v2-steps">{['نوع الجولة','المناطق','الجهات','المراجعة والحفظ'].map((t,i)=>
      <span key={i} className={i===stage?'active':''}>{i+1}. {t}</span>)}</div>
    {stage===0&&<div className="v2-quick-grid">{Object.entries(kinds).map(([key,label])=>
      <button type="button" key={key} className={'v2-shortcut '+(type===key?'active':'')} onClick={()=>{setType(key as any);setAreas([]);setTargets([]);setRetry(null)}}>{label}</button>)}</div>}
    {stage===1&&<SelectMany items={catalog.data?.areas||[]} selected={areas} onChange={selectAreas} label="اختر منطقة أو عدة مناطق"/>}
    {stage===2&&<>
      <p>الجهات المتاحة ضمن المناطق المختارة: {eligible.length}</p>
      <SelectMany label="الجهات التي تمت زيارتها" items={eligible} selected={selectedTargets} onChange={selectTargets}/>
      <SelectMany label="الأصناف التي تم شرحها" items={catalog.data?.products||[]} selected={products} onChange={v=>{setProducts(v);setRetry(null)}}/>
    </>}
    {stage===3&&<><div className="stats"><Metric label="النوع" value={kinds[type]}/><Metric label="المناطق" value={areas.length}/><Metric label="الجهات" value={selectedTargets.length}/></div>
      <label className="field">تاريخ الجولة<input type="date" value={visitDate} max={today()} onChange={e=>{setVisitDate(e.target.value);setRetry(null)}}/></label>
      <label className="field">ملاحظات<textarea value={notes} onChange={e=>{setNotes(e.target.value);setRetry(null)}} rows={3}/></label>
      <Notice>{editRoundId?'سيُحفظ التعديل وفق صلاحيتك ومهلة تعديل الجولة.':'الموقع يُلتقط عند الحفظ حسب سياسة الشركة. عند تعذر الطلب يمكنك إعادة المحاولة بنفس بيانات الجولة دون تكرار تسجيلها.'}</Notice>
    </>}
    <Failure error={error}/><Done message={done}/>
    <div className="v2-action-bar">
      <button type="button" className="btn" disabled={stage===0||busy} onClick={()=>setStage(s=>s-1)}>السابق</button>
      {stage<3?<button type="button" className="btn primary" disabled={(stage===1&&!areas.length)||(stage===2&&!selectedTargets.length)} onClick={()=>setStage(s=>s+1)}>التالي</button>:
      <button type="button" className="btn primary" disabled={busy||!selectedTargets.length} onClick={submit}>{busy?'جارٍ الحفظ…':'حفظ الجولة'}</button>}
    </div>
  </Section>;
}
function VisitHistory({revision,update,go}: {revision:number;update:()=>void;go:(page:string)=>void}) {
  const [type,setType]=useState('DOCTOR');
  const state=useRemote('/rep/visit-history?type='+type,revision);
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function cancel(item:any) {
    if(!item.roundId||!item.canEdit||!window.confirm('هل تريد إلغاء هذه الجولة؟ سيتم إلغاء زياراتها المسجلة.'))return;
    setBusy(true);setError('');setMessage('');
    try{await write('/rep/rounds/'+encodeURIComponent(item.roundId)+'/cancel',{revision:item.revision});
      setMessage('تم إلغاء الجولة.');update();
    }catch(e:any){setError(e.message)}finally{setBusy(false)}
  }
  return <Section title="سجل زياراتي"><div className="v2-filter-bar"><select value={type} onChange={e=>setType(e.target.value)}>
    {Object.entries(kinds).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
    <Wait state={state}/><ArrayList items={state.data?.items||[]} columns={[
      {label:'الجهة',show:x=>x.targets?.map((t:any)=>t.name).join('، ')||'—'},
      {label:'تاريخ الجولة',show:x=>dateText(x.visitDate||x.date||x.completedAt)},
      {label:'المناطق',show:x=>x.areas?.map((a:any)=>a.name).join('، ')||'—'},
      {label:'الزيارات',show:x=>x.targets?.length??0},
      {label:'الحالة',show:x=>x.status==='CANCELLED'?'ملغاة':'مكتملة'},
      {label:'الإجراء',show:x=>x.canEdit&&x.roundId?<div className="v2-inline-controls">
        <button type="button" className="btn" onClick={()=>go('round?editId='+encodeURIComponent(x.roundId))}>تعديل</button>
        <button type="button" className="btn danger" disabled={busy} onClick={()=>cancel(x)}>إلغاء</button>
      </div>:'—'}
    ]}/><Failure error={error}/><Done message={message}/></Section>;
}
function RepAnalytics({revision}: {revision:number}) {
  const state=useRemote('/rep/analytics',revision);
  const d=state.data||{}, current=d.current||{}, summary=current.summary||{};
  return <><Wait state={state}/><Section title="التحليل والتقرير">
    <div className="stats"><Metric label="تغطية السايكل" value={(summary.coverage??0)+'%'}/>
      <Metric label="التزام Frequency" value={(summary.compliance??0)+'%'}/>
      <Metric label="أطباء غير مزارين" value={summary.unvisited??0}/>
      <Metric label="زيارات أطباء A" value={summary.aVisits??0}/>
    </div>
    <ArrayList items={d.comparison||[]} columns={[
      {label:'المؤشر',show:x=>x.label},{label:'الحالي',show:x=>x.current},
      {label:'السابق',show:x=>x.previous},{label:'الفرق',show:x=>x.delta}
    ]}/>
  </Section></>;
}
function RepReports({revision,update}: {revision:number;update:()=>void}) {
  const [period,setPeriod]=useState('WEEKLY'),[from,setFrom]=useState(''),[to,setTo]=useState(today());
  const [preview,setPreview]=useState<any>(null),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  const saved=useRemote('/rep/reports',revision);
  const query=new URLSearchParams({period});if(from)query.set('from',from);if(to)query.set('to',to);
  async function load(save=false) {
    setBusy(true);setError('');setMessage('');
    try {
      const data=await request('/rep/reports/preview?'+query.toString());
      setPreview(data);
      if(save){
        await write('/rep/reports',{clientRef:crypto.randomUUID(),period,...(from?{from}:{}),...(to?{to}:{})});
        setMessage('تم حفظ التقرير وإرساله للمدير المختص.');
        update();
      }
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <><Section title="التحليل والتقرير — طباعة وحفظ">
    <div className="v2-filter-bar"><label>الفترة<select value={period} onChange={e=>setPeriod(e.target.value)}>
      <option value="DAILY">يومي</option><option value="WEEKLY">أسبوعي</option><option value="CUSTOM">مخصص</option></select></label>
      {period==='CUSTOM'&&<label>من<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label>}
      <label>إلى<input type="date" value={to} max={today()} onChange={e=>setTo(e.target.value)}/></label>
    </div>
    <div className="v2-action-bar"><Action disabled={busy} onClick={()=>load()}>عرض التقرير</Action>
      <Action disabled={busy} onClick={()=>load(true)}>حفظ وإرسال للمدير</Action>
      <button type="button" className="btn" disabled={!preview} onClick={()=>window.print()}>طباعة / حفظ PDF</button></div>
    <Failure error={error}/><Done message={message}/>
    {preview&&<div id="v2-print-report" className="v2-print-report"><h3>تقرير المندوب</h3><pre>{JSON.stringify(preview,null,2)}</pre></div>}
  </Section><Section title="التقارير المحفوظة"><Wait state={saved}/><ArrayList items={saved.data?.items||[]} columns={[
    {label:'الفترة',show:x=>x.period},{label:'من',show:x=>dateText(x.startsOn)},
    {label:'إلى',show:x=>dateText(x.endsOn)},{label:'تاريخ الحفظ',show:x=>dateText(x.createdAt)}
  ]}/></Section></>;
}
function RepLeaves({revision,update}: {revision:number;update:()=>void}) {
  const state=useRemote('/rep/leaves',revision);
  const [type,setType]=useState('ANNUAL'),[from,setFrom]=useState(today()),[to,setTo]=useState(today());
  const [reason,setReason]=useState(''),[file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function submit(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try {
      const fd=new FormData();
      fd.set('clientRef',crypto.randomUUID());fd.set('type',type);fd.set('from',from);fd.set('to',to);
      if(reason)fd.set('reason',reason);
      if(file){
        if(file.size>2*1024*1024||!['application/pdf','image/png','image/jpeg'].includes(file.type))throw new Error('الملف يجب أن يكون PDF أو PNG/JPEG وأقل من 2 ميغابايت');
        fd.set('attachment',file);
      }
      await request('/rep/leaves',{method:'POST',body:fd});
      setMessage('تم إرسال طلب الإجازة.');update();
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <><Section title="طلب إجازة"><div className="stats"><Metric label="الرصيد المتبقي" value={state.data?.balance}/>
    <Metric label="جهة الموافقة" value={state.data?.approver?.name||'غير محدد'}/></div>
    <form className="form" onSubmit={submit}>
      <label className="field">نوع الإجازة<select value={type} onChange={e=>setType(e.target.value)}>{['ANNUAL','SICK','EMERGENCY','UNPAID'].map(x=><option value={x} key={x}>{statuses[x]}</option>)}</select></label>
      <div className="form-grid"><label className="field">من<input type="date" value={from} onChange={e=>setFrom(e.target.value)} required/></label>
        <label className="field">إلى<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)} required/></label></div>
      <label className="field">سبب الطلب<textarea value={reason} onChange={e=>setReason(e.target.value)} rows={3}/></label>
      <label className="field">مرفق اختياري<input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
      <button type="submit" disabled={busy} className="btn primary">{busy?'جارٍ الإرسال…':'إرسال الطلب'}</button>
    </form><Failure error={error}/><Done message={message}/></Section>
    <Section title="طلباتي"><Wait state={state}/><ArrayList items={state.data?.items||[]} columns={[
      {label:'النوع',show:x=>statuses[x.type]||x.type},{label:'من',show:x=>dateText(x.startsOn)},
      {label:'إلى',show:x=>dateText(x.endsOn)},{label:'الحالة',show:x=>statuses[x.status]||x.status},
      {label:'ملاحظات المدير',show:x=>x.reviewNote||'—'}
    ]}/></Section></>;
}
export function RepScreen(props: Props) {
  const {page,revision,go,preselectedArea,update,user}=props;
  if(page==='dashboard')return <RepHome {...props}/>;
  if(page==='plan')return <RepPlan revision={revision}/>;
  if(page==='areas')return <RepAreas revision={revision} goArea={id=>go('round?areaId='+encodeURIComponent(id))}/>;
  if(page==='doctors')return <RepTargets type="DOCTOR" revision={revision}/>;
  if(page==='pharmacies')return <RepTargets type="PHARMACY" revision={revision}/>;
  if(page==='hospitals')return <RepTargets type="HOSPITAL" revision={revision}/>;
  if(page==='round')return <NewRound revision={revision} go={go} preselectedArea={preselectedArea} editRoundId={new URLSearchParams(window.location.search).get('editId')} update={update}/>;
  if(page==='history')return <VisitHistory revision={revision} update={update} go={go}/>;
  if(page==='analytics')return <RepAnalytics revision={revision}/>;
  if(page==='reports')return <RepReports revision={revision} update={update}/>;
  if(page==='leaves')return <RepLeaves revision={revision} update={update}/>;
  if(page==='notifications')return <Notifications revision={revision}/>;
  if(page==='account')return <Section title="حسابي"><p>الاسم: {user.name}</p><p>اسم المستخدم: {user.username}</p><p>الصلاحية: {user.roles.join('، ')}</p></Section>;
  return <Empty title="الصفحة غير متاحة"/>;
}
function Notifications({revision}: {revision:number}) {
  const state=useRemote('/rep/notifications',revision);
  return <Section title="الإشعارات"><Wait state={state}/><ArrayList items={state.data?.items||[]} columns={[
    {label:'العنوان',show:x=>x.title},{label:'الرسالة',show:x=>x.message},
    {label:'التاريخ',show:x=>dateText(x.createdAt)}
  ]}/></Section>;
}
