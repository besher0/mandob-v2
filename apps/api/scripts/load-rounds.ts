import ExcelJS from 'exceljs';
import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/database/prisma.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { PlatformService } from '../src/platform/platform.service.js';
import { CompanyService } from '../src/company/company.service.js';
import { AreaManagementService } from '../src/manager/area-management.service.js';
import { TargetManagementService } from '../src/manager/target-management.service.js';
import { RepManagementService } from '../src/manager/rep-management.service.js';
import { RecurringCycleService } from '../src/cycles/recurring-cycle.service.js';
import { RepWorkspaceService } from '../src/rep/rep-workspace.service.js';
import { ManagerService } from '../src/manager/manager.service.js';
import type { AuthUser } from '../src/auth/auth.types.js';


const databaseUrl = new URL(process.env.DATABASE_URL ?? "");
if (!/^medrep_load_[a-z0-9_]+$/.test(databaseUrl.pathname.slice(1))) throw new Error("Dedicated load database required");
const config = new ConfigService(process.env), db = new PrismaService(config);
await db.$connect();
const tx = db;
const code = "load-" + randomUUID().slice(0,20);
try {
    const rootRole=await tx.role.findUniqueOrThrow({where:{code:'SUPER_ADMIN'}});
    const root=await tx.user.create({data:{username:randomUUID(),name:'Fixture platform admin',passwordHash:'not-a-login',roles:{create:{roleId:rootRole.id}}}});
    const rootAuth:AuthUser={id:root.id,name:root.name,username:root.username,organizationId:null,roles:['SUPER_ADMIN'],permissions:[]};
    const platform=new PlatformService(db),company=new CompanyService(db),auth=new AuthService(db,new JwtService(),config);
    const password='Onboarding-test-2026',ownerUsername=randomUUID();
    const organization=await platform.create(rootAuth,{name:'Isolated onboarding company',code,ownerName:'Owner',username:ownerUsername,password});
    const owner=(await auth.login({username:ownerUsername,password})).user;
    assert.equal(owner.organizationId,organization.id);
    const province=await company.province(owner,{name:'Province'});
    const specialty=await company.catalog(owner,'specialties',{name:'Cardiology'});
    const product=await company.catalog(owner,'products',{name:'Product'});
    const classification=await company.createClass(owner,{code:'A',name:'Priority'});
    const areas=new AreaManagementService(db);
    const group=await areas.save(owner,{name:'West',provinceId:province.id},'group');
    const area=await areas.save(owner,{name:'District',provinceId:province.id,groupId:group.id},'area');
    const schedule={mode:'MONTH_AND_HALF' as const,length:1,frequency:[{id:classification.id,requiredVisits:3}],workingDays:Array.from({length:7},(_,weekday)=>({weekday,isWorking:true}))};
    await new RecurringCycleService(db).save(owner,schedule,schedule);
    const managerUsername=randomUUID();
    const managerAccount=await company.manager(owner,{name:'Manager',username:managerUsername,password});
    const manager=(await auth.login({username:managerUsername,password})).user;
    const team=await company.team(owner,{name:'RX1',provinceId:province.id,managerId:managerAccount.id,specialtyIds:[specialty.id],productIds:[product.id]});
    const targets=new TargetManagementService(db);
    const doctor=await targets.save(owner,{type:'DOCTOR',name:'Doctor',areaId:area.id,targetClassId:classification.id,specialtyId:specialty.id});

 const repService = new RepWorkspaceService(db);
 const inputs: {user:AuthUser;dto:Parameters<RepWorkspaceService["register"]>[1]}[]=[];
 for(let i=0;i<200;i++){
   const username=randomUUID();
   await new RepManagementService(db).create(owner,{name:"Load rep "+i,username,password,teamId:team.id,areaIds:[area.id],specialtyIds:[specialty.id],productIds:[product.id],dailyVisitTarget:8});
   const user=(await auth.login({username,password})).user;
   const workspace=await repService.workspace(user);
   inputs.push({user,dto:{clientRef:randomUUID(),cycleId:workspace.cycle!.id,type:"DOCTOR",areaIds:[area.id],targetIds:[doctor.id],productIds:[product.id],visitDate:workspace.cycle!.today,notes:"Isolated load test"}});
   if((i+1)%50===0) console.log("Prepared representatives:",i+1);
 }
 const started=performance.now();
 const results=await Promise.all(inputs.map(async({user,dto})=>{
   const start=performance.now();
   try {const value=await repService.register(user,dto);return {ok:true,value,ms:performance.now()-start};}
   catch(error){return {ok:false,ms:performance.now()-start,error:error instanceof Error?error.message:String(error)};}
 }));
 const times=results.map(r=>r.ms).sort((a,b)=>a-b);
 const counts={
  rounds:await db.fieldRound.count({where:{organizationId:organization.id}}),
  visits:await db.visit.count({where:{organizationId:organization.id}})
 };
 const failures=results.filter(r=>!r.ok);
 console.log(JSON.stringify({scenario:"200 simultaneous service registrations, PostgreSQL, pool 10; not HTTP or production capacity",durationMs:Math.round(performance.now()-started),success:200-failures.length,failed:failures.length,p50Ms:Math.round(times[99]),p95Ms:Math.round(times[189]),maxMs:Math.round(times[199]),counts,errors:[...new Set(failures.map(r=>r.error))]},null,2));
 // Replay each successful request; database counts must not increase.
 for(let i=0;i<inputs.length;i++)if(results[i].ok)await repService.register(inputs[i].user,inputs[i].dto);
 assert.equal(await db.fieldRound.count({where:{organizationId:organization.id}}),counts.rounds);
 assert.equal(await db.visit.count({where:{organizationId:organization.id}}),counts.visits);
 assert.equal(counts.rounds,200-failures.length);
 assert.equal(counts.visits,200-failures.length);
 console.log("Replay and atomic counts verified");
 if(failures.length)process.exitCode=1;
} finally { await db.$disconnect(); }
