import React,{useEffect,useMemo,useState} from 'react';
import {CurrentUser,clearSession,has,login,logout,primaryRole,restore} from './api';
import {CompanyScreen,Platform} from './Company';
import {ManagerScreen} from './Manager';
import {RepScreen} from './Rep';
import {Notice} from './ui';

type MenuEntry={key:string;label:string;icon:string;required:string[]};
const repMenu:MenuEntry[]=[
  {key:'dashboard',label:'الرئيسية',icon:'⌂',required:['analytics.view_own']},
  {key:'plan',label:'الخطة والأصناف',icon:'▣',required:['targets.view']},
  {key:'areas',label:'مناطقي',icon:'▦',required:['targets.view']},
  {key:'doctors',label:'الأطباء',icon:'♙',required:['targets.view']},
  {key:'pharmacies',label:'الصيدليات',icon:'✚',required:['targets.view']},
  {key:'hospitals',label:'المشافي',icon:'▤',required:['targets.view']},
  {key:'round',label:'جولة جديدة',icon:'＋',required:['rounds.create','visits.create']},
  {key:'history',label:'سجل الزيارات',icon:'≡',required:['visits.view_own']},
  {key:'analytics',label:'التحليل',icon:'◴',required:['analytics.view_own']},
  {key:'reports',label:'التقارير',icon:'▥',required:['reports.view_own']},
  {key:'leaves',label:'الإجازات',icon:'☼',required:['leaves.view_own']},
  {key:'notifications',label:'الإشعارات',icon:'♢',required:['notifications.view_own']},
  {key:'account',label:'حسابي',icon:'◎',required:[]}
];
const managerMenu:MenuEntry[]=[
  {key:'manager-dashboard',label:'الرئيسية',icon:'⌂',required:['teams.view','analytics.view_team','visits.view_team','targets.view','products.view','areas.view','users.view']},
  {key:'manager-teams',label:'الفرق',icon:'▦',required:['teams.view']},
  {key:'manager-reps',label:'المندوبون',icon:'♙',required:['users.view']},
  {key:'manager-areas',label:'المناطق',icon:'▤',required:['areas.view']},
  {key:'manager-targets',label:'الجهات الطبية',icon:'✚',required:['targets.view']},
  {key:'manager-visits',label:'الجولات',icon:'⊙',required:['visits.view_team']},
  {key:'manager-reports',label:'تقارير الفرق',icon:'▥',required:['reports.view_team']},
  {key:'manager-leaves',label:'طلبات الإجازات',icon:'☼',required:['leaves.approve_team']}
];
const companyMenu:MenuEntry[]=[
  {key:'company-dashboard',label:'لوحة الشركة',icon:'⌂',required:['organizations.view']},
  {key:'company-teams',label:'الفرق والمدراء',icon:'♙',required:['teams.manage']},
  {key:'company-catalog',label:'البيانات الأساسية',icon:'▤',required:['areas.manage']},
  {key:'company-cycles',label:'السايكلات',icon:'◴',required:['cycles.configure']},
  {key:'company-access',label:'أدوار الموظفين',icon:'⚿',required:[]}
];
const staffMenu:MenuEntry[]=[
  {key:'staff-dashboard',label:'مساحة العمل',icon:'⌂',required:[]},
  {key:'manager-areas',label:'المناطق',icon:'▦',required:['areas.view']},
  {key:'manager-targets',label:'الجهات الطبية',icon:'✚',required:['targets.view']}
];
const platformMenu:MenuEntry[]=[{key:'platform',label:'الشركات',icon:'▣',required:['system.manage']}];
const titles:Record<string,string>=Object.fromEntries([...repMenu,...managerMenu,...companyMenu,...staffMenu,...platformMenu].map(x=>[x.key,x.label]));

function menuFor(user:CurrentUser) {
  const role=primaryRole(user);
  if(role==='SUPER_ADMIN')return platformMenu;
  if(role==='NATIONAL_MANAGER')return [...companyMenu,...managerMenu.filter(x=>['manager-targets','manager-reports','manager-visits','manager-areas'].includes(x.key))]
    .filter(x=>x.key==='company-access'||has(user,...x.required));
  if(role==='TEAM_MANAGER')return [...managerMenu,...repMenu.filter(x=>['round','history','reports','leaves','account'].includes(x.key))]
    .filter(x=>has(user,...x.required));
  if(role==='REP')return repMenu.filter(x=>has(user,...x.required));
  return staffMenu.filter(x=>has(user,...x.required));
}
function slugFor(role:string){
  return role==='SUPER_ADMIN'?'super-admin':role==='NATIONAL_MANAGER'?'company':role==='TEAM_MANAGER'?'manager':role==='REP'?'rep':'staff';
}
function parseUrl() {
  const parts=window.location.pathname.split('/').filter(Boolean);
  return {slug:parts[0]||'',page:parts[1]||'',areaId:new URLSearchParams(window.location.search).get('areaId')};
}
function Login({onLogin}:{onLogin:(user:CurrentUser)=>void}){
  const [username,setUsername]=useState(''),[password,setPassword]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError('');
    try{onLogin(await login(username.trim(),password));}catch(e:any){setError(e.message);}finally{setBusy(false);}
  }
  return <div className="login-wrap"><div className="login-card">
    <span className="brand-symbol">M</span><h1>Mandob</h1><p>إدارة المندوبين الطبيين</p>
    <form onSubmit={submit} className="form">
      <label className="field">اسم المستخدم<input required autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)}/></label>
      <label className="field">كلمة المرور<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
      {error&&<Notice error>{error}</Notice>}
      <button className="btn primary large" disabled={busy}>{busy?'جارٍ التحقق…':'تسجيل الدخول'}</button>
    </form></div></div>;
}
function App() {
  const [user,setUser]=useState<CurrentUser|null>(null),[booting,setBooting]=useState(true);
  const [route,setRoute]=useState(parseUrl),[revision,setRevision]=useState(0),[loggingOut,setLoggingOut]=useState(false);
  const update=()=>setRevision(n=>n+1);
  useEffect(()=>{let alive=true;restore().then(u=>{if(alive)setUser(u)}).finally(()=>{if(alive)setBooting(false)});
    const pop=()=>setRoute(parseUrl());window.addEventListener('popstate',pop);
    return()=>{alive=false;window.removeEventListener('popstate',pop)};
  },[]);
  const menu=useMemo(()=>user?menuFor(user):[],[user]);
  const role=user?primaryRole(user):'REP', slug=slugFor(role);
  const permitted=menu.find(m=>m.key===route.page);
  const page=permitted&&route.slug===slug?route.page:(menu[0]?.key||'');
  useEffect(()=>{
    if(!user||booting||!page)return;
    const desired='/'+slug+'/'+page;
    if(window.location.pathname!==desired){
      window.history.replaceState({},'',desired);
      setRoute(parseUrl());
    }
  },[user,booting,slug,page]);
  function go(value:string){
    const [target,query]=value.split('?');
    if(!menu.some(m=>m.key===target))return;
    const url='/'+slug+'/'+target+(query?'?'+query:'');
    window.history.pushState({},'',url);
    setRoute(parseUrl());window.scrollTo({top:0,behavior:'instant'});
  }
  function signedIn(u:CurrentUser){
    setUser(u);setRevision(0);const entries=menuFor(u);
    const path='/'+slugFor(primaryRole(u))+'/'+(entries[0]?.key||'');
    window.history.replaceState({},'',path);setRoute(parseUrl());
  }
  async function signOut(){
    setLoggingOut(true);
    try{await logout();}finally{
      clearSession();setUser(null);setLoggingOut(false);
      window.history.replaceState({},'','/login');setRoute(parseUrl());
    }
  }
  if(booting)return <div className="login-wrap"><div className="login-card"><p>جارٍ التحقق من الجلسة…</p></div></div>;
  if(!user)return <Login onLogin={signedIn}/>;
  if(!page)return <div className="login-wrap"><div className="login-card">
    <Notice error>هذا الحساب لا يملك صلاحية الوصول إلى مساحة عمل متاحة.</Notice>
    <button className="btn" onClick={signOut}>تسجيل الخروج</button></div></div>;
  return <div dir="rtl" className={'v2-shell '+(role==='REP'?'rep-layout':'company-layout')}>
    <aside className="v2-sidebar company-sidebar">
      <div className="company-brand"><span className="company-logo">M</span>
        <div className="company-brand-text"><strong>Mandob</strong><span>{role==='SUPER_ADMIN'?'مدير النظام':role==='NATIONAL_MANAGER'?'مدير الشركة':role==='TEAM_MANAGER'?'مدير الفريق':role==='REP'?'المندوب الطبي':'موظف الشركة'}</span></div>
      </div>
      <nav className="sidebar-nav" aria-label="التنقل الرئيسي">{menu.map(entry=>
        <button key={entry.key} type="button" className={'nav-item '+(page===entry.key?'active':'')} onClick={()=>go(entry.key)}>
          <span className="nav-icon">{entry.icon}</span><span>{entry.label}</span>
        </button>)}</nav>
      <div className="sidebar-bottom"><div className="manager-profile"><div className="manager-avatar">{user.name.slice(0,1)}</div>
        <div className="company-manager-copy"><strong>{user.name}</strong><span>{user.username}</span></div>
        <button className="company-logout" onClick={signOut} disabled={loggingOut}>خروج</button>
      </div></div>
    </aside>
    <div className="v2-main">
      <header className="v2-topbar company-topbar"><div><h1>{titles[page]||'لوحة التحكم'}</h1>
        <p>نظام متابعة المندوبين والفرق الطبية</p></div>
        <div className="v2-top-actions"><span>{user.name}</span>
          <button type="button" className="btn" onClick={update} title="تحديث البيانات">↻ تحديث</button>
        </div>
      </header>
      <main className="v2-content">
        {page==='platform'?<Platform revision={revision} update={update}/>:
        page.startsWith('company-')?<CompanyScreen page={page} revision={revision} update={update}/>:
        page.startsWith('manager-')||page==='staff-dashboard'?<ManagerScreen user={user} page={page} revision={revision} update={update}/>:
        <RepScreen user={user} page={page} revision={revision} go={go} preselectedArea={route.areaId} update={update}/>}
      </main>
    </div>
    {role==='REP'&&<nav className="rep-bottom-nav v2-mobile-nav" aria-label="التنقل السريع">
      {menu.filter(m=>['dashboard','areas','round','reports','account'].includes(m.key)).map(entry=>
        <button key={entry.key} type="button" className={page===entry.key?'active':''} onClick={()=>go(entry.key)}>
          <span>{entry.icon}</span><small>{entry.label}</small>
        </button>)}
    </nav>}
  </div>;
}
export default App;
