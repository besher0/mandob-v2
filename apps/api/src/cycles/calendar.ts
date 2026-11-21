export type Cadence = {mode:'MONTHS'|'MONTH_AND_HALF'|'DAYS';length:number};
export function calendarPeriods(year:number,cadence:Cadence){
  const end=new Date(Date.UTC(year+1,0,1)),boundaries:Date[]=[];
  if(cadence.mode==='MONTHS')for(let m=0;m<12;m+=cadence.length)boundaries.push(new Date(Date.UTC(year,m,1)));
  else if(cadence.mode==='MONTH_AND_HALF')for(let m=0;m<12;m+=3){boundaries.push(new Date(Date.UTC(year,m,1)),new Date(Date.UTC(year,m+1,16)));}
  else for(let d=new Date(Date.UTC(year,0,1));d<end;d=new Date(+d+cadence.length*86400000))boundaries.push(d);
  return boundaries.map((start,i)=>({start,end:new Date(+(boundaries[i+1]??end)-86400000)}));
}
