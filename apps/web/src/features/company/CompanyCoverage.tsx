"use client";
import type { Named } from '@/lib/api';
import { useResource, ResourceState } from '../rep/useResource';
import s from '../manager/ManagerApp.module.css';
type Coverage = {cycle:Named|null;physicalVisits:number;unallocatedVisits:number;provinces:(Named & {assignedTargets:number;reps:number;physicalVisits:number;required:number;remaining:number;coverage:number|null;unvisited:number;incomplete:number})[]};
export function CompanyCoverage({token}:{token:string}) {
  const resource=useResource<Coverage>('/company/setup/coverage',token,15000),data=resource.data;
  if(!data)return <ResourceState error={resource.error} retry={resource.reload}/>;
  if(!data.cycle)return <p className={s.empty}>لا يوجد سايكل فعال حالياً لعرض التغطية.</p>;
  return <><div className={s.sectionHead}><h2>{data.cycle.name}</h2><button className={s.btn} onClick={resource.reload}>تحديث التغطية</button></div><section className={s.card}><h3>الزيارات الفعلية: {data.physicalVisits}</h3><p>تُعدّ الزيارة مرة واحدة، حتى لو احتُسبت لأكثر من فريق. نسبة تحقيق الخطة تراعي المطلوب لكل مندوب وفريق، ولا تتجاوز الزيارات المطلوبة لكل جهة.</p><p>غير المزار وغير المكتمل يمثلان تكليفات المندوبين والفرق، وقد تتكرر الجهة المشتركة بين أكثر من تكليف.</p></section>{data.unallocatedVisits>0&&<p className={s.notice}>{data.unallocatedVisits} زيارة غير مرتبطة بتكليف فريق؛ تظهر في الإجمالي فقط.</p>}<div className={`${s.card} ${s.tableCard}`}><table className={s.table}><thead><tr><th>المحافظة</th><th>المندوبون المكلّفون</th><th>الجهات</th><th>الزيارات الفعلية</th><th>المطلوب</th><th>المتبقي</th><th>تحقيق الخطة</th><th>غير مزار</th><th>غير مكتمل</th></tr></thead><tbody>{data.provinces.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.reps}</td><td>{p.assignedTargets}</td><td>{p.physicalVisits}</td><td>{p.required}</td><td>{p.remaining}</td><td>{p.coverage===null?'لا تكليف':`${p.coverage}%`}</td><td>{p.unvisited}</td><td>{p.incomplete}</td></tr>)}</tbody></table></div></>;
}
