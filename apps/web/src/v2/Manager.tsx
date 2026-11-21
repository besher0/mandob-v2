import React,{useMemo,useState} from 'react';
import {CurrentUser,has,request,write} from './api';
import {Action,ArrayList,Done,Empty,Failure,Metric,Notice,Section,SelectMany,Wait,dateText,useRemote} from './ui';

function ManagerHome({revision}:{revision:number}) {
  const state=useRemote('/manager/workspace',revision),d=state.data||{},s=d.summary||{};
  return <><Wait state={state}/><Section title="لوحة مدير الفريق">
    <div className="stats"><Metric label="الفرق المدارة" value={d.teams?.length??0}/>
      <Metric label="المندوبون" value={s.reps??0}/><Metric label="الجولات" value={d.rounds?.length??0}/>
      <Metric label="زيارات اليوم" value={s.visitsToday??0}/><Metric label="تغطية الفريق" value={(s.coverage??0)+'%'}/>
      <Metric label="إجازات بانتظار الموافقة" value={s.pendingLeaves??0}/></div>
  </Section><Section title="الفرق التابعة لإدارتي"><ArrayList items={d.teams||[]} columns={[
    {label:'الفريق',show:x=>x.name},{label:'المحافظة',show:x=>x.province?.name||'—'},
    {label:'المندوبون',show:x=>x.repCount},{label:'التغطية',show:x=>x.coverage+'%'}
  ]}/></Section>
  <Section title="المندوبون"><ArrayList items={d.reps||[]} columns={[
    {label:'المندوب',show:x=>x.name},{label:'عدد الفرق',show:x=>x.teamIds?.length||0},
    {label:'المناطق',show:x=>x.areas?.map((a:any)=>a.name).join('، ')||'—'},
    {label:'الزيارات المطلوبة',show:x=>x.requiredVisits},
    {label:'المكتملة',show:x=>x.completedVisits},{label:'التغطية',show:x=>x.coverage+'%'}
  ]}/></Section></>;
}
function ManagerAreas({user,revision,update}:{user:CurrentUser;revision:number;update:()=>void}) {
  const state=useRemote('/manager/area-catalog',revision),d=state.data||{};
  const canEdit=has(user,'areas.manage_own');
  const [name,setName]=useState(''),[provinceId,setProvinceId]=useState(''),[groupId,setGroupId]=useState('');
  const [groupName,setGroupName]=useState(''),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[message,setMessage]=useState('');
  async function add(path:string,payload:any){
    setBusy(true);setError('');setMessage('');
    try{await write(path,payload);setMessage('تم حفظ التغييرات.');update();}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <><Section title="المناطق ومجموعاتها"><Wait state={state}/>
    <ArrayList items={d.areas||[]} columns={[
      {label:'المنطقة',show:x=>x.name},
      {label:'المحافظة',show:x=>(d.provinces||[]).find((p:any)=>p.id===x.provinceId)?.name||'—'},
      {label:'المجموعة',show:x=>(d.groups||[]).find((p:any)=>p.id===x.groupId)?.name||'—'}
    ]}/></Section>
    {canEdit&&<Section title="إدارة المناطق"><label className="field">المحافظة<select required value={provinceId} onChange={e=>{setProvinceId(e.target.value);setGroupId('')}}>
      <option value="">اختر المحافظة</option>{(d.provinces||[]).map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <form className="form v2-form-inline" onSubmit={e=>{e.preventDefault();add('/manager/area-groups',{name:groupName,provinceId});}}>
        <label className="field">إنشاء مجموعة<input required value={groupName} onChange={e=>setGroupName(e.target.value)}/></label>
        <button className="btn primary" disabled={busy||!provinceId}>إضافة مجموعة</button></form>
      <form className="form v2-form-inline" onSubmit={e=>{e.preventDefault();add('/manager/areas',{name,provinceId,...(groupId?{groupId}:{})});}}>
        <label className="field">اسم المنطقة<input required value={name} onChange={e=>setName(e.target.value)}/></label>
        <label className="field">المجموعة<select value={groupId} onChange={e=>setGroupId(e.target.value)}>
          <option value="">بدون مجموعة</option>{(d.groups||[]).filter((g:any)=>g.provinceId===provinceId).map((g:any)=><option key={g.id} value={g.id}>{g.name}</option>)}
        </select></label><button className="btn primary" disabled={busy||!provinceId}>إضافة منطقة</button></form>
      <Failure error={error}/><Done message={message}/>
    </Section>}</>;
}
function ManagerTargets({user,revision,update}:{user:CurrentUser;revision:number;update:()=>void}) {
  const [type,setType]=useState('DOCTOR'),[name,setName]=useState(''),[areaId,setAreaId]=useState('');
  const [targetClassId,setTargetClassId]=useState(''),[specialtyId,setSpecialtyId]=useState('');
  const [phone,setPhone]=useState(''),[address,setAddress]=useState('');
  const [search,setSearch]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const options=useRemote('/manager/target-options',revision);
  const list=useRemote('/manager/targets?type='+type,revision);
  const items=(list.data?.items||[]).filter((x:any)=>x.name.toLowerCase().includes(search.toLowerCase()));
  const canEdit=has(user,'targets.manage');
  async function add(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try{await write('/manager/targets',{type,name,areaId,targetClassId,...(specialtyId&&type==='DOCTOR'?{specialtyId}:{}),phone,address});
      setMessage('تمت إضافة الجهة.');setName('');update();
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <><Section title="الأطباء والصيدليات والمشافي"><div className="v2-filter-bar">
    <label>نوع الجهة<select value={type} onChange={e=>setType(e.target.value)}><option value="DOCTOR">الأطباء</option>
      <option value="PHARMACY">الصيدليات</option><option value="HOSPITAL">المشافي</option></select></label>
    <input placeholder="بحث عن جهة" value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <Wait state={list}/><ArrayList items={items} columns={[
      {label:'الاسم',show:x=>x.name},{label:'التصنيف',show:x=>x.targetClass?.code||x.classCode||'—'},
      {label:'المنطقة',show:x=>x.locations?.map((l:any)=>l.area?.name||l.areaName).join('، ')||'—'},
      {label:'الزيارات',show:x=>x._count?.visits??x.visitCount??0}
    ]}/></Section>
    {canEdit&&<Section title="إضافة جهة"><Wait state={options}/><form className="form" onSubmit={add}>
      <label className="field">الاسم<input required value={name} onChange={e=>setName(e.target.value)}/></label>
      <div className="form-grid">
        <label className="field">المنطقة<select required value={areaId} onChange={e=>setAreaId(e.target.value)}><option value="">اختر</option>
          {(options.data?.areas||[]).map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field">التصنيف<select required value={targetClassId} onChange={e=>setTargetClassId(e.target.value)}><option value="">اختر</option>
          {(options.data?.classes||[]).map((x:any)=><option key={x.id} value={x.id}>{x.code}</option>)}</select></label>
        {type==='DOCTOR'&&<label className="field">الاختصاص<select value={specialtyId} onChange={e=>setSpecialtyId(e.target.value)}>
          <option value="">اختر</option>{(options.data?.specialties||[]).map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}
        </select></label>}
        <label className="field">الهاتف<input value={phone} onChange={e=>setPhone(e.target.value)}/></label>
        <label className="field">العنوان<input value={address} onChange={e=>setAddress(e.target.value)}/></label>
      </div><button className="btn primary" disabled={busy}>حفظ الجهة</button></form>
      <Failure error={error}/><Done message={message}/>
    </Section>}</>;
}
function ManagerReps({user,revision,update}:{user:CurrentUser;revision:number;update:()=>void}) {
  const workspace=useRemote('/manager/workspace',revision);
  const options=useRemote(has(user,'users.view','areas.view','products.view','specialties.view')?'/manager/rep-options':null,revision);
  const teams=options.data?.teams||[];
  const [name,setName]=useState(''),[username,setUsername]=useState(''),[password,setPassword]=useState('');
  const [teamId,setTeamId]=useState(''),[dailyVisitTarget,setDailyVisitTarget]=useState(20);
  const [areaIds,setAreaIds]=useState<string[]>([]),[productIds,setProductIds]=useState<string[]>([]),[specialtyIds,setSpecialtyIds]=useState<string[]>([]);
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const team=teams.find((t:any)=>t.id===teamId);
  const teamAreas=(options.data?.areas||[]).filter((a:any)=>a.provinceId===team?.provinceId);
  async function create(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try{await write('/manager/reps',{name,username,password,teamId,dailyVisitTarget,areaIds,productIds,specialtyIds});
      setMessage('تم إنشاء حساب المندوب.');setPassword('');update();
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <><Section title="المندوبون"><Wait state={workspace}/><ArrayList items={workspace.data?.reps||[]} columns={[
    {label:'المندوب',show:x=>x.name},{label:'الفرق',show:x=>x.teamIds?.length??0},
    {label:'التغطية',show:x=>x.coverage+'%'},{label:'آخر زيارة',show:x=>dateText(x.lastVisit)}
  ]}/></Section>
  {has(user,'users.manage_own')&&<Section title="إضافة مندوب"><Wait state={options}/>
    <form className="form" onSubmit={create}>
      <div className="form-grid"><label className="field">الاسم<input required value={name} onChange={e=>setName(e.target.value)}/></label>
        <label className="field">اسم الدخول<input required pattern="[A-Za-z0-9_.-]{3,80}" value={username} onChange={e=>setUsername(e.target.value)}/></label>
        <label className="field">كلمة المرور<input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <label className="field">الفريق<select required value={teamId} onChange={e=>{setTeamId(e.target.value);setAreaIds([]);setProductIds([]);setSpecialtyIds([])}}>
          <option value="">اختر الفريق</option>{teams.map((x:any)=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="field">هدف الزيارات اليومي<input type="number" min={1} max={500} value={dailyVisitTarget} onChange={e=>setDailyVisitTarget(Number(e.target.value))}/></label>
      </div>
      <SelectMany label="المناطق" items={teamAreas} selected={areaIds} onChange={setAreaIds}/>
      <SelectMany label="الأصناف" items={team?.products||[]} selected={productIds} onChange={setProductIds}/>
      <SelectMany label="الاختصاصات" items={team?.specialties||[]} selected={specialtyIds} onChange={setSpecialtyIds}/>
      <button className="btn primary" disabled={busy||!teamId||!areaIds.length}>إنشاء المندوب</button>
    </form><Failure error={error}/><Done message={message}/></Section>}</>;
}
function ManagerTeams({user,revision,update}:{user:CurrentUser;revision:number;update:()=>void}) {
  const state=useRemote('/manager/workspace',revision);
  const options=useRemote(has(user,'teams.create_own')?'/manager/team-options':null,revision);
  const [name,setName]=useState(''),[provinceId,setProvinceId]=useState('');
  const [specialtyIds,setSpecialtyIds]=useState<string[]>([]),[productIds,setProductIds]=useState<string[]>([]);
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function create(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try{await write('/manager/teams',{name,provinceId,specialtyIds,productIds});setMessage('تم إنشاء الفريق.');update();}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <><Section title="فرقي"><Wait state={state}/><ArrayList items={state.data?.teams||[]} columns={[
    {label:'الفريق',show:x=>x.name},{label:'المحافظة',show:x=>x.province?.name||'—'},
    {label:'المندوبون',show:x=>x.repCount},{label:'التغطية',show:x=>x.coverage+'%'}
  ]}/></Section>
  {has(user,'teams.create_own')&&<Section title="إنشاء فريق ضمن نطاقي"><Wait state={options}/><form className="form" onSubmit={create}>
    <label className="field">الاسم<input required value={name} onChange={e=>setName(e.target.value)}/></label>
    <label className="field">المحافظة<select required value={provinceId} onChange={e=>setProvinceId(e.target.value)}>
      <option value="">اختر</option>{(options.data?.provinces||[]).map((p:any)=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
    <SelectMany label="الاختصاصات" items={options.data?.specialties||[]} selected={specialtyIds} onChange={setSpecialtyIds}/>
    <SelectMany label="الأصناف" items={options.data?.products||[]} selected={productIds} onChange={setProductIds}/>
    <button className="btn primary" disabled={busy}>إنشاء</button></form>
    <Failure error={error}/><Done message={message}/>
  </Section>}</>;
}
function ManagerReports({revision}:{revision:number}) {
  const state=useRemote('/manager/reports',revision);
  return <Section title="تقارير المندوبين"><Wait state={state}/><ArrayList items={state.data?.items||[]} columns={[
    {label:'المندوب',show:x=>x.report?.rep?.name||'—'},{label:'الفريق',show:x=>x.team?.name||'—'},
    {label:'الفترة',show:x=>x.report?.period||'—'},{label:'التاريخ',show:x=>dateText(x.report?.createdAt)}
  ]}/></Section>;
}
function ManagerLeaves({revision,update}:{revision:number;update:()=>void}) {
  const state=useRemote('/manager/leaves',revision);
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function decide(id:string,status:'APPROVED'|'REJECTED') {
    setBusy(id);setError('');setMessage('');
    try{await write('/manager/leaves/'+id,{status},'PATCH');setMessage('تم تسجيل القرار.');update();}
    catch(e:any){setError(e.message);}finally{setBusy('');}
  }
  return <Section title="طلبات إجازات الفريق"><Wait state={state}/>
    <ArrayList items={state.data?.items||[]} columns={[
      {label:'المندوب',show:x=>x.requester?.name||'—'},{label:'من',show:x=>dateText(x.startsOn)},
      {label:'إلى',show:x=>dateText(x.endsOn)},{label:'الحالة',show:x=>x.status},
      {label:'الإجراء',show:x=>x.status==='PENDING'?<div className="v2-inline-controls">
        <button className="btn primary" disabled={!!busy} onClick={()=>decide(x.id,'APPROVED')}>قبول</button>
        <button className="btn danger" disabled={!!busy} onClick={()=>decide(x.id,'REJECTED')}>رفض</button>
      </div>:x.reviewNote||'تمت المراجعة'}
    ]}/><Failure error={error}/><Done message={message}/>
  </Section>;
}
function ManagerVisits({revision}:{revision:number}) {
  const state=useRemote('/manager/workspace',revision);
  return <Section title="الجولات والزيارات"><Wait state={state}/>
    <ArrayList items={state.data?.rounds||[]} columns={[
      {label:'المندوب',show:x=>x.repName},{label:'التاريخ',show:x=>dateText(x.date)},
      {label:'النوع',show:x=>x.type},{label:'المناطق',show:x=>x.areas?.map((a:any)=>a.name).join('، ')||'—'},
      {label:'الزيارات',show:x=>x.visits?.length||0}
    ]}/></Section>;
}
function StaffHome({revision}:{revision:number}) {
  const state=useRemote('/company/staff-workspace',revision);
  return <Section title="مساحة عمل موظف الشركة"><Wait state={state}/>
    <div className="stats"><Metric label="الاختصاصات المتاحة" value={state.data?.specialties?.length??0}/>
      <Metric label="الأصناف المتاحة" value={state.data?.products?.length??0}/></div>
    <Notice>القوائم والأزرار الظاهرة لحسابك تعتمد على أذونات دورك المخصص وليس على أذونات المدير.</Notice>
  </Section>;
}
export function ManagerScreen({user,page,revision,update}:{user:CurrentUser;page:string;revision:number;update:()=>void}) {
  if(page==='manager-dashboard')return <ManagerHome revision={revision}/>;
  if(page==='manager-areas')return <ManagerAreas user={user} revision={revision} update={update}/>;
  if(page==='manager-targets')return <ManagerTargets user={user} revision={revision} update={update}/>;
  if(page==='manager-reps')return <ManagerReps user={user} revision={revision} update={update}/>;
  if(page==='manager-teams')return <ManagerTeams user={user} revision={revision} update={update}/>;
  if(page==='manager-reports')return <ManagerReports revision={revision}/>;
  if(page==='manager-leaves')return <ManagerLeaves revision={revision} update={update}/>;
  if(page==='manager-visits')return <ManagerVisits revision={revision}/>;
  if(page==='staff-dashboard')return <StaffHome revision={revision}/>;
  return <Empty title="الصفحة غير متاحة"/>;
}
