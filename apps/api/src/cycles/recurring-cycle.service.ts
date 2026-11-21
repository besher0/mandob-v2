import { Type } from 'class-transformer';
import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { IsIn, IsInt, Min, Max, IsArray, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
import { PrismaService } from '../database/prisma.service.js';
import { FrequencyDto, WorkingDayDto } from '../manager/cycle-settings.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { dateInZone } from '../rep/rep-workspace.service.js';
import { calendarPeriods, type Cadence } from './calendar.js';
import type { Prisma } from '../generated/prisma/client.js';
export class ScheduleDto {
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({each:true}) @Type(()=>FrequencyDto) frequency:FrequencyDto[];
 @IsArray() @ArrayMinSize(7) @ArrayMaxSize(7) @ValidateNested({each:true}) @Type(()=>WorkingDayDto) workingDays:WorkingDayDto[];
 @IsIn(['MONTHS','MONTH_AND_HALF','DAYS']) mode:Cadence['mode'];
 @IsInt() @Min(1) @Max(366) length:number;
}
type Rules={frequency:{id:string;requiredVisits:number}[];workingDays:{weekday:number;isWorking:boolean}[]};
export type Schedule=Cadence & Rules;
@Injectable()
export class RecurringCycleService {
 constructor(private readonly db:PrismaService){}
 private async authorize(user:AuthUser){
  if(!user.organizationId||!await this.db.user.findFirst({where:{id:user.id,organizationId:user.organizationId,status:'ACTIVE',deletedAt:null,roles:{some:{role:{code:'NATIONAL_MANAGER',permissions:{some:{permission:{code:'cycles.configure'}}}}}}}}))throw new ForbiddenException('إعداد السايكل لصاحب الشركة المخوّل.');
  return user.organizationId;
 }
 async options(user:AuthUser){const organizationId=await this.authorize(user);const settings=await this.db.organizationSettings.findUnique({where:{organizationId}});const schedule=settings?.cycleSchedule as Schedule|null;const year=Number(dateInZone(new Date(),settings?.timezone??'Asia/Damascus').slice(0,4));const classes=await this.db.targetClass.findMany({where:{organizationId,isActive:true},select:{id:true,code:true,name:true},orderBy:{rank:'asc'}});const cycles=await this.db.cycle.findMany({where:{organizationId},select:{id:true,name:true,startsAt:true,endsAt:true},orderBy:{startsAt:'desc'}});const latest=await this.db.cycle.findFirst({where:{organizationId},orderBy:{endsAt:'desc'},include:{classRules:true,workingDays:true}});const defaults={frequency:latest?.classRules.map(r=>({id:r.targetClassId,requiredVisits:r.requiredVisits}))??[],workingDays:latest?.workingDays.map(d=>({weekday:d.weekday,isWorking:d.isWorking}))??[]};return {classes,cycles,schedule,defaults,year,periods:schedule?calendarPeriods(year,schedule).map(p=>({startsOn:p.start.toISOString().slice(0,10),endsOn:p.end.toISOString().slice(0,10)})):[]};}
 async save(user:AuthUser,cadence:ScheduleDto,rules:Rules){
  const organizationId=await this.authorize(user);
  if(!['MONTHS','MONTH_AND_HALF','DAYS'].includes(cadence.mode)||!Number.isInteger(cadence.length)||cadence.length<1||cadence.length>(cadence.mode==='MONTHS'?12:366)||!rules.frequency.length||new Set(rules.frequency.map(x=>x.id)).size!==rules.frequency.length||rules.frequency.some(x=>!Number.isInteger(x.requiredVisits)||x.requiredVisits<1||x.requiredVisits>365)||rules.workingDays.length!==7||new Set(rules.workingDays.map(x=>x.weekday)).size!==7||rules.workingDays.some(x=>x.weekday<0||x.weekday>6||!Number.isInteger(x.weekday)||typeof x.isWorking!=='boolean')||!rules.workingDays.some(x=>x.isWorking))throw new BadRequestException('تحقق من المدة والتكرار وأيام العمل.');
  const schedule:Schedule={mode:cadence.mode,length:cadence.mode==='MONTH_AND_HALF'?1:cadence.length,frequency:rules.frequency.map(x=>({id:x.id,requiredVisits:x.requiredVisits})),workingDays:rules.workingDays.map(x=>({weekday:x.weekday,isWorking:x.isWorking}))};
  await this.db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
   const classes=await tx.targetClass.findMany({where:{organizationId,isActive:true},select:{id:true}});
   if(classes.length!==schedule.frequency.length||classes.some(c=>!schedule.frequency.some(f=>f.id===c.id)))throw new BadRequestException('حدد تكرار كل تصنيفات الشركة الحالية.');
   await tx.organizationSettings.upsert({where:{organizationId},create:{organizationId,cycleSchedule:schedule},update:{cycleSchedule:schedule}});
   await tx.auditLog.create({data:{organizationId,actorId:user.id,action:'UPDATE',entityType:'CycleSchedule',entityId:organizationId,afterData:schedule}});
   await this.materialize(tx,organizationId,new Date());
  },{timeout:30000});
  return this.options(user);
 }
 async ensure(organizationId:string,now=new Date()){
  const settings=await this.db.organizationSettings.findUnique({where:{organizationId}});
  if(!settings?.cycleSchedule)return;
  const day=dateInZone(now,settings.timezone),today=new Date(day+'T00:00:00Z');
  if(await this.db.cycle.findFirst({where:{organizationId,status:'ACTIVE',startsAt:{lte:today},endsAt:{gte:today}},select:{id:true}}))return;
  await this.db.$transaction(async tx=>{
   await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`;
   await this.materialize(tx,organizationId,now);
  },{timeout:30000});
 }
 private async materialize(tx:Prisma.TransactionClient,organizationId:string,now:Date){
   const currentSettings=await tx.organizationSettings.findUniqueOrThrow({where:{organizationId}});
   const day=dateInZone(now,currentSettings.timezone),today=new Date(day+'T00:00:00Z');
   const schedule=currentSettings.cycleSchedule as Schedule;
   if(!schedule)return;
   if(await tx.cycle.findFirst({where:{organizationId,status:'ACTIVE',startsAt:{lte:today},endsAt:{gte:today}}}))return;
   const period=calendarPeriods(Number(day.slice(0,4)),schedule).find(p=>p.start<=today&&p.end>=today)!;
   const previous=await tx.cycle.findFirst({where:{organizationId,status:{in:['ACTIVE','CLOSED']},endsAt:{lt:today}},orderBy:{endsAt:'desc'}});
   // Keep recorded history intact; a first transition may use only the remainder of a calendar period.
   if(previous&&previous.endsAt>=period.start)period.start=new Date(+previous.endsAt+86400000);
   const overlap=await tx.cycle.findFirst({where:{organizationId,status:{in:['ACTIVE','DRAFT']},startsAt:{lte:period.end},endsAt:{gte:period.start}}});
   if(overlap)throw new BadRequestException('يوجد سايكل يدوي يتداخل مع الجدول الدوري؛ راجع مدته قبل المتابعة.');
   const cycle=await tx.cycle.create({data:{organizationId,name:`${period.start.toISOString().slice(0,10)} — ${period.end.toISOString().slice(0,10)}`,startsAt:period.start,endsAt:period.end,timezone:currentSettings.timezone,status:'ACTIVE',classRules:{create:schedule.frequency.map(f=>({targetClassId:f.id,requiredVisits:f.requiredVisits}))},workingDays:{create:schedule.workingDays}}});
   if(previous)await this.carry(tx,organizationId,previous.id,previous.endsAt,cycle,schedule,now);
   await tx.auditLog.create({data:{organizationId,action:'CREATE',entityType:'AutomaticCycle',entityId:cycle.id,afterData:{startsOn:period.start.toISOString(),endsOn:period.end.toISOString()}}});
 }
 private async carry(tx:Prisma.TransactionClient,organizationId:string,oldId:string,oldEnd:Date,cycle:{id:string;startsAt:Date;endsAt:Date},schedule:Schedule,now:Date){
  const legacy=await tx.repCycleTeamPeriod.findFirst({where:{scopeConfigured:false,startedAt:{lte:oldEnd},OR:[{endedAt:null},{endedAt:{gte:oldEnd}}],repCycleProfile:{organizationId,cycleId:oldId,isActive:true,rep:{organizationId,status:'ACTIVE',deletedAt:null}},team:{organizationId,isActive:true,deletedAt:null}},include:{repCycleProfile:{select:{rep:{select:{name:true}}}},team:{select:{name:true}}}});
  if(legacy)throw new BadRequestException(`تعذر انتقال السايكل: تكليف المندوب «${legacy.repCycleProfile.rep.name}» في فريق «${legacy.team.name}» يحتاج تحديد نطاقه قبل الانتقال.`);
  const profiles=await tx.repCycleProfile.findMany({where:{organizationId,cycleId:oldId,isActive:true,rep:{organizationId,status:'ACTIVE',deletedAt:null}},include:{teamPeriods:{where:{scopeConfigured:true,startedAt:{lte:oldEnd},OR:[{endedAt:null},{endedAt:{gte:oldEnd}}],team:{organizationId,isActive:true,deletedAt:null}},include:{team:true,scopeAreas:{include:{area:true}},scopeProducts:{include:{product:true}},scopeSpecialties:{include:{specialty:true}}}}}});
  for(const source of profiles){
   let next:{id:string}|null=null;
   for(const scope of source.teamPeriods){
    if(!await tx.teamMember.findFirst({where:{teamId:scope.teamId,userId:source.repId,isManager:false,startedAt:{lte:now},OR:[{endedAt:null},{endedAt:{gt:now}}]}}))continue;
    const areaIds=scope.scopeAreas.filter(a=>a.area.organizationId===organizationId&&!a.area.deletedAt&&a.area.provinceId===scope.team.provinceId).map(a=>a.areaId);
    const productIds=scope.scopeProducts.filter(p=>p.product.organizationId===organizationId&&p.product.isActive&&!p.product.deletedAt).map(p=>p.productId);
    const specialtyIds=scope.scopeSpecialties.filter(s=>s.specialty.organizationId===organizationId&&!s.specialty.deletedAt).map(s=>s.specialtyId);
    if(!next)next=await tx.repCycleProfile.create({data:{organizationId,cycleId:cycle.id,repId:source.repId,dailyVisitTarget:source.dailyVisitTarget,managerInstructions:source.managerInstructions,aCoverageTarget:source.aCoverageTarget}});
    await tx.repCycleArea.createMany({data:areaIds.map(areaId=>({repCycleProfileId:next!.id,areaId})),skipDuplicates:true});
    await tx.repCycleProduct.createMany({data:productIds.map(productId=>({repCycleProfileId:next!.id,productId})),skipDuplicates:true});
    await tx.repCycleSpecialty.createMany({data:specialtyIds.map(specialtyId=>({repCycleProfileId:next!.id,specialtyId})),skipDuplicates:true});
    const targets=await tx.fieldTarget.findMany({where:{organizationId,isActive:true,deletedAt:null,locations:{some:{areaId:{in:areaIds}}},OR:[{type:{in:['PHARMACY','HOSPITAL']}},{type:'DOCTOR',specialties:{some:{specialtyId:{in:specialtyIds}}}}]},include:{targetClass:true}});
    const quotas=[];
    for(const target of targets){const required=schedule.frequency.find(f=>f.id===target.targetClassId)?.requiredVisits;
     if(!required||!target.targetClass?.isActive)throw new BadRequestException(`التصنيف أو التكرار غير متاح للجهة ${target.name}.`);
     const row=await tx.repCycleTarget.upsert({where:{repCycleProfileId_targetId:{repCycleProfileId:next.id,targetId:target.id}},create:{repCycleProfileId:next.id,targetId:target.id,targetClassId:target.targetClassId!,requiredVisits:required},update:{}});
     quotas.push({repCycleTargetId:row.id,requiredVisits:required});
    }
    await tx.repCycleTeamPeriod.create({data:{repCycleProfileId:next.id,teamId:scope.teamId,startedAt:cycle.startsAt,endedAt:cycle.endsAt,scopeConfigured:true,scopeAreas:{create:areaIds.map(areaId=>({areaId}))},scopeProducts:{create:productIds.map(productId=>({productId}))},scopeSpecialties:{create:specialtyIds.map(specialtyId=>({specialtyId}))},scopeTargets:{create:quotas}}});
   }
  }
 }
}
