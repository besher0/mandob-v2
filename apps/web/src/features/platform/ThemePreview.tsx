"use client";
import { useState } from 'react';
import { ThemeIcon } from "./ThemeIcon";
import Image from 'next/image';
import { type Branding, themeStyle } from './CompanyTheme';
import m from '../manager/ManagerApp.module.css';
import s from './PlatformApp.module.css';
export function ThemePreview({theme}:{theme:Branding}) {
  const [view,setView]=useState<'manager'|'rep'>('manager');
  const logo=theme.logo?<Image src={theme.logo} width={40} height={40} unoptimized alt="الشعار"/>:theme.displayName.slice(0,1);
  return <section className={s.card}><h2>معاينة القالب</h2><p>نفس أنماط الواجهة الفعلية. الشرطات للتوضيح فقط؛ لا توجد بيانات تجريبية محفوظة.</p>
    <div className={s.previewTabs}><button type="button" aria-pressed={view==='manager'} onClick={()=>setView('manager')}>لوحة المدير</button><button type="button" aria-pressed={view==='rep'} onClick={()=>setView('rep')}>واجهة المندوب</button></div>
    <div className={`company-theme ${s.livePreview}`} data-layout={theme.layout??'CLASSIC'} style={themeStyle(theme)}>
      {view==='manager'?<div className={`${m.app} ${s.managerPreview}`}>
        <aside className={m.sidebar} style={{position:'static',height:'auto'}}><div className={m.brand}><span>{logo}</span><div><h2>{theme.displayName}</h2><p>إدارة فرقك الميدانية</p></div></div><nav className={m.menu}>{['لوحة التحكم','الفريق','الأطباء','الجولات'].map((label,i)=><button key={label} type="button" tabIndex={-1} aria-disabled="true" className={i===0?m.active:''}><ThemeIcon name={["home","team","doctors","tours"][i]} size={20}/>{label}</button>)}</nav></aside>
        <div className={m.main}><header className={m.topbar}><h1>لوحة مدير الفريق</h1></header><div className={m.content}><section className={m.hero}><div><h2>متابعة السايكل</h2><p>الزيارات والتغطية ضمن فريقك</p></div></section><div className={m.statsRow}>{['الزيارات','التغطية'].map(label=><div className={`${m.card} ${m.smallStat}`} key={label}><span>{label}</span><strong>—</strong></div>)}</div><div className={`${m.card} ${m.tableCard}`}><table className={m.table}><thead><tr><th>المندوب</th><th>الزيارات</th><th>التغطية</th></tr></thead><tbody><tr><td>—</td><td>—</td><td>—</td></tr><tr><td>—</td><td>—</td><td>—</td></tr></tbody></table></div></div></div>
      </div>:<div className={s.repPreview}><div className="phone" style={{minHeight:0}}><header className="topbar" style={{position:'static'}}><div className="brand"><div className="logo">{logo}</div><h1>{theme.displayName}</h1></div></header><div className="screen" style={{paddingBottom:24}}><section className="hero"><h2>يومك الميداني</h2><p>متابعة الزيارات والسايكل</p><div className="hero-row"><div className="hero-stat"><strong>—</strong><span>زيارة</span></div><div className="hero-stat"><strong>—</strong><span>تغطية</span></div></div></section><h3>مساحة العمل</h3><div className="home-shortcuts">{['الأطباء','المناطق','الصيدليات','سجل الزيارات'].map((label,i)=><div className="hub-card" key={label}><div className="hub-icon"><ThemeIcon name={['doctors','areas','pharmacies','reports'][i]} size={28}/></div><strong>{label}</strong><p>متابعة بياناتك</p></div>)}</div><button type="button" tabIndex={-1} aria-disabled="true" className="primary full" style={{marginTop:18}}>ابدأ جولة</button></div></div></div>}
    </div>
  </section>;
}
