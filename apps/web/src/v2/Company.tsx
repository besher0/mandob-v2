import React,{useState} from 'react';
import {CurrentUser,write} from './api';
import {Action,ArrayList,Done,Empty,Failure,Metric,Section,SelectMany,Wait,dateText,useRemote} from './ui';

export function Platform({revision,update}:{revision:number;update:()=>void}) {
  const state=useRemote('/platform/companies',revision);
  const [name,setName]=useState(''),[code,setCode]=useState(''),[ownerName,setOwnerName]=useState('');
  const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  async function create(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try {await write('/platform/companies',{name,code,ownerName,username,password});
      setMessage('تم إنشاء الشركة وحساب مديرها.');setPassword('');update();
    }catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <><Section title="إدارة الشركات"><Wait state={state}/>
    <ArrayList items={state.data?.items||[]} columns={[
      {label:'الشركة',show:x=>x.name},{label:'الرمز',show:x=>x.code},
      {label:'المستخدمون',show:x=>x._count?.users??0},{label:'الفرق',show:x=>x._count?.teams??0},
      {label:'الحالة',show:x=>x.status}
    ]}/></Section><Section title="إضافة شركة وحساب المدير">
    <form className="form" onSubmit={create}><div className="form-grid">
      <label className="field">اسم الشركة<input required value={name} onChange={e=>setName(e.target.value)} maxLength={100}/></label>
      <label className="field">رمز الشركة (إنكليزي)<input required value={code} pattern="[a-z0-9][a-z0-9-]{1,39}" onChange={e=>setCode(e.target.value)}/></label>
      <label className="field">اسم مدير الشركة<input required value={ownerName} onChange={e=>setOwnerName(e.target.value)}/></label>
      <label className="field">اسم الدخول<input required value={username} onChange={e=>setUsername(e.target.value)} pattern="[A-Za-z0-9._-]{3,80}"/></label>
      <label className="field">كلمة مرور قوية<input type="password" required minLength={10} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    </div><button type="submit" className="btn primary" disabled={busy}>{busy?'جارٍ الإنشاء…':'إنشاء الشركة'}</button></form>
    <Failure error={error}/><Done message={message}/>
  </Section></>;
}
function CompanyHome({revision}:{revision:number}) {
  const state=useRemote('/company/setup',revision);
  const coverage=useRemote('/company/setup/coverage',revision);
  const d=state.data||{};
  return <><Wait state={state}/><Section title="نظرة عامة على الشركة"><div className="stats">
    <Metric label="المندوبون" value={d.repCount??0}/>
    <Metric label="الفرق" value={d.teams?.length??0}/>
    <Metric label="مدراء الفرق" value={d.managers?.length??0}/>
    <Metric label="المحافظات" value={d.provinces?.length??0}/>
    <Metric label="الأصناف" value={d.products?.length??0}/>
  </div></Section><Section title="تغطية المحافظات"><Wait state={coverage}/>
    <ArrayList items={coverage.data?.provinces||[]} columns={[
      {label:'المحافظة',show:x=>x.name},{label:'المندوبون',show:x=>x.reps},
      {label:'الزيارات',show:x=>x.physicalVisits},{label:'التغطية',show:x=>x.coverage===null?'—':x.coverage+'%'},
      {label:'المتبقي',show:x=>x.remaining}
    ]}/></Section></>;
}
function CompanyTeams({revision,update}:{revision:number;update:()=>void}) {
  const state=useRemote('/company/setup',revision),d=state.data||{};
  const [managerName,setManagerName]=useState(''),[username,setUsername]=useState(''),[password,setPassword]=useState('');
  const [teamName,setTeamName]=useState(''),[provinceId,setProvinceId]=useState(''),[managerId,setManagerId]=useState('');
  const [specialtyIds,setSpecialtyIds]=useState<string[]>([]),[productIds,setProductIds]=useState<string[]>([]);
  const [assign,setAssign]=useState<Record<string,string>>({});
  const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  async function run(path:string,payload:unknown,verb:'POST'|'PATCH'='POST') {
    setBusy(true);setError('');setMessage('');
    try{await write(path,payload,verb);setMessage('تم حفظ التغييرات.');update();}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <><Wait state={state}/><Section title="الفرق ومدراء الفرق">
    <Notice>يمكن إسناد مدير واحد لأكثر من فريق. تغيير مدير فريق لا يغيّر تكليفاته مع بقية الفرق.</Notice>
    <ArrayList items={d.teams||[]} columns={[
      {label:'الفريق',show:x=>x.name},{label:'المحافظة',show:x=>x.province?.name||'—'},
      {label:'المدير الحالي',show:x=>x.members?.filter((m:any)=>m.user).map((m:any)=>m.user.name).join('، ')||'غير معيّن'},
      {label:'المندوبون',show:x=>(d.reps||[]).filter((r:any)=>r.teamMemberships?.some((m:any)=>m.team.id===x.id)).length},
      {label:'تغيير المدير',show:x=><div className="v2-inline-controls">
        <select aria-label={'تغيير مدير '+x.name} value={assign[x.id]||''} onChange={e=>setAssign(p=>({...p,[x.id]:e.target.value}))}>
          <option value="">اختر مديراً</option>{(d.managers||[]).map((m:any)=><option key={m.id} value={m.id}>{m.name}</option>)}
        </select><button disabled={busy||!assign[x.id]} className="btn" type="button" onClick={()=>run('/company/setup/teams/'+x.id+'/manager',{
          managerId:assign[x.id],expectedManagerIds:(x.members||[]).map((m:any)=>m.user.id)
        },'PATCH')}>حفظ</button>
      </div>}
    ]}/>
  </Section>
  <Section title="إضافة مدير فريق"><form className="form" onSubmit={e=>{e.preventDefault();run('/company/setup/managers',{name:managerName,username,password});}}>
    <div className="form-grid">
      <label className="field">الاسم<input required value={managerName} onChange={e=>setManagerName(e.target.value)}/></label>
      <label className="field">اسم الدخول<input required pattern="[A-Za-z0-9._-]{3,80}" value={username} onChange={e=>setUsername(e.target.value)}/></label>
      <label className="field">كلمة المرور<input required type="password" minLength={10} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    </div><button className="btn primary" disabled={busy}>إضافة مدير فريق</button></form></Section>
  <Section title="إضافة فريق"><form className="form" onSubmit={e=>{e.preventDefault();run('/company/setup/teams',{name:teamName,provinceId,managerId,specialtyIds,productIds});}}>
    <label className="field">اسم الفريق<input required value={teamName} onChange={e=>setTeamName(e.target.value)}/></label>
    <div className="form-grid">
      <label className="field">المحافظة<select required value={provinceId} onChange={e=>setProvinceId(e.target.value)}><option value="">اختر</option>
        {(d.provinces||[]).map((x:any)=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
      <label className="field">مدير الفريق<select required value={managerId} onChange={e=>setManagerId(e.target.value)}><option value="">اختر</option>
        {(d.managers||[]).map((x:any)=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>
    </div>
    <SelectMany label="الاختصاصات" items={d.specialties||[]} selected={specialtyIds} onChange={setSpecialtyIds}/>
    <SelectMany label="الأصناف" items={d.products||[]} selected={productIds} onChange={setProductIds}/>
    <button className="btn primary" disabled={busy}>إنشاء الفريق</button></form>
    <Failure error={error}/><Done message={message}/>
  </Section></>;
}
function CompanyCatalog({revision,update}:{revision:number;update:()=>void}) {
  const state=useRemote('/company/setup',revision),d=state.data||{};
  const [kind,setKind]=useState('provinces'),[name,setName]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const kinds:Record<string,string>={provinces:'المحافظات',specialties:'الاختصاصات',products:'الأصناف'};
  async function save(e:React.FormEvent) {
    e.preventDefault();setBusy(true);setError('');setMessage('');
    try{await write('/company/setup/'+kind,{name});setName('');setMessage('تمت الإضافة.');update();}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <Section title="بيانات الشركة"><Wait state={state}/>
    <div className="v2-filter-bar"><select aria-label="القسم" value={kind} onChange={e=>setKind(e.target.value)}>
      {Object.entries(kinds).map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></div>
    <ArrayList items={d[kind]||[]} columns={[
      {label:'الاسم',show:x=>x.name},{label:'الرمز',show:x=>x.code||'—'}
    ]}/>
    <form className="form v2-form-inline" onSubmit={save}>
      <label className="field">إضافة {kinds[kind]}<input required value={name} onChange={e=>setName(e.target.value)}/></label>
      <button className="btn primary" disabled={busy}>إضافة</button></form>
    <Failure error={error}/><Done message={message}/>
  </Section>;
}
function CompanyCycles({revision}: {revision:number}) {
  const state=useRemote('/company/setup/cycles',revision);
  return <Section title="السايكلات"><Wait state={state}/>
    <ArrayList items={state.data?.cycles||[]} columns={[
      {label:'الاسم',show:x=>x.name},{label:'البداية',show:x=>dateText(x.startsAt)},
      {label:'النهاية',show:x=>dateText(x.endsAt)},{label:'الحالة',show:x=>x.status}
    ]}/>
    <Notice>إعداد تكرار السايكلات وقواعد التغطية يُدار من واجهات v2 المتخصصة؛ لن ننشئ سايكل بإعدادات ناقصة.</Notice>
  </Section>;
}
function CompanyAccess({revision,update}:{revision:number;update:()=>void}) {
  const state=useRemote('/company/access',revision),d=state.data||{};
  const [name,setName]=useState(''),[permissionIds,setPermissionIds]=useState<string[]>([]);
  const [staffName,setStaffName]=useState(''),[staffUsername,setStaffUsername]=useState(''),[staffPassword,setStaffPassword]=useState(''),[roleId,setRoleId]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  async function run(path:string,payload:unknown){
    setBusy(true);setError('');setMessage('');
    try{await write(path,payload);setMessage('تم حفظ التغييرات.');update();}
    catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <><Wait state={state}/><Section title="الأدوار المخصصة"><ArrayList items={d.roles||[]} columns={[
    {label:'الدور',show:x=>x.name},{label:'عدد الموظفين',show:x=>x.staffCount},
    {label:'الصلاحيات',show:x=>x.permissionIds?.length??0}
  ]}/>
    <form className="form" onSubmit={e=>{e.preventDefault();run('/company/access/roles',{name,permissionIds});}}>
      <label className="field">اسم الدور<input required value={name} onChange={e=>setName(e.target.value)}/></label>
      <SelectMany label="صلاحيات هذا الدور (الخادم يطبّق التبعيات تلقائياً)" items={d.permissions||[]} selected={permissionIds} onChange={setPermissionIds}/>
      <button className="btn primary" disabled={busy}>إنشاء دور</button>
    </form></Section>
    <Section title="موظفو الشركة"><ArrayList items={d.staff||[]} columns={[
      {label:'الاسم',show:x=>x.name},{label:'اسم الدخول',show:x=>x.username},
      {label:'الحالة',show:x=>x.status},{label:'الدور',show:x=>(d.roles||[]).find((r:any)=>r.id===x.roleId)?.name||'—'}
    ]}/>
      <form className="form" onSubmit={e=>{e.preventDefault();run('/company/access/staff',{name:staffName,username:staffUsername,password:staffPassword,roleId});}}>
        <div className="form-grid"><label className="field">الاسم<input required value={staffName} onChange={e=>setStaffName(e.target.value)}/></label>
          <label className="field">اسم الدخول<input required pattern="[A-Za-z0-9._-]{3,80}" value={staffUsername} onChange={e=>setStaffUsername(e.target.value)}/></label>
          <label className="field">كلمة المرور<input required type="password" minLength={10} value={staffPassword} onChange={e=>setStaffPassword(e.target.value)}/></label>
          <label className="field">الدور<select required value={roleId} onChange={e=>setRoleId(e.target.value)}>
            <option value="">اختر الدور</option>{(d.roles||[]).map((r:any)=><option key={r.id} value={r.id}>{r.name}</option>)}
          </select></label></div><button className="btn primary" disabled={busy}>إنشاء موظف</button>
      </form><Failure error={error}/><Done message={message}/></Section>
  </>;
}
export function CompanyScreen({page,revision,update}:{page:string;revision:number;update:()=>void}) {
  if(page==='company-dashboard')return <CompanyHome revision={revision}/>;
  if(page==='company-teams')return <CompanyTeams revision={revision} update={update}/>;
  if(page==='company-catalog')return <CompanyCatalog revision={revision} update={update}/>;
  if(page==='company-cycles')return <CompanyCycles revision={revision}/>;
  if(page==='company-access')return <CompanyAccess revision={revision} update={update}/>;
  return <Empty title="الصفحة غير متاحة"/>;
}
