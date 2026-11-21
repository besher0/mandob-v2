import { hasCompanyAccess } from './company-access.js';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { IsArray, ArrayUnique, ArrayMaxSize, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { dateInZone } from '../rep/rep-workspace.service.js';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CycleSettingsDto } from '../manager/cycle-settings.service.js';
export class CreateCompanyCycleDto extends CycleSettingsDto {
  @IsString() @MinLength(1) @MaxLength(120) name:string;
}
export class CompanyClassDto {
  @IsString() @MinLength(1) @MaxLength(30) code:string;
  @IsString() @MinLength(1) @MaxLength(120) name:string;
}
export class ProvinceDto { @IsString() @MinLength(1) @MaxLength(120) name: string; }
export class ManagerIdentityDto extends ProvinceDto {
  @Matches(/^[A-Za-z0-9._-]{3,80}$/) username: string;
}
export class ManagerAccountDto extends ManagerIdentityDto {
  @IsString() @MinLength(10) @MaxLength(72) password: string;
}
export class ChangeTeamManagerDto {
  @IsUUID() managerId:string;
  @IsArray() @ArrayUnique() @ArrayMaxSize(200) @IsUUID('all',{each:true}) expectedManagerIds:string[];
}
export class CompanyTeamDto extends ProvinceDto {
  @IsUUID() provinceId: string;
  @IsUUID() managerId: string;
  @IsArray() @ArrayUnique() @ArrayMaxSize(200) @IsUUID('all',{each:true}) specialtyIds: string[];
  @IsArray() @ArrayUnique() @ArrayMaxSize(200) @IsUUID('all',{each:true}) productIds: string[];
}
@Injectable()
export class CompanyService {
  constructor(private readonly db: PrismaService) {}
  private async org(user:AuthUser, permission:string) {
    if(!user.organizationId) throw new ForbiddenException('الحساب غير مرتبط بشركة.');
    if (['areas.manage','specialties.manage','products.manage','analytics.view_national'].includes(permission) && await hasCompanyAccess(this.db,user,permission)) return user.organizationId;
    const actor=await this.db.user.findFirst({where:{id:user.id,organizationId:user.organizationId,status:'ACTIVE',deletedAt:null,roles:{some:{role:{code:'NATIONAL_MANAGER',permissions:{some:{permission:{code:permission}}}}}}},select:{id:true}});
    if(!actor) throw new ForbiddenException('هذه العملية لصاحب الشركة المخوّل.');
    return user.organizationId;
  }
  private async write<T>(fn:(db:Prisma.TransactionClient)=>Promise<T>) {
    try{return await this.db.$transaction(fn,{isolationLevel:'Serializable'});}
    catch(e){if(e instanceof Prisma.PrismaClientKnownRequestError){if(e.code==='P2002')throw new ConflictException('الاسم أو اسم الدخول مستخدم مسبقاً.');if(e.code==='P2034')throw new ConflictException('حصل تعديل متزامن؛ أعد المحاولة.');}throw e;}
  }
  async workspace(user:AuthUser){
    const organizationId=await this.org(user,'organizations.view');
    const [provinces,managers,teams,specialties,products,reps]=await Promise.all([
      this.db.province.findMany({where:{organizationId,deletedAt:null},select:{id:true,name:true,_count:{select:{areas:{where:{deletedAt:null}},teams:{where:{deletedAt:null,isActive:true}}}}},orderBy:{name:'asc'}}),
      this.db.user.findMany({where:{organizationId,deletedAt:null,status:'ACTIVE',roles:{some:{role:{code:'TEAM_MANAGER'}}}},select:{id:true,name:true,username:true},orderBy:{name:'asc'}}),
      this.db.team.findMany({where:{organizationId,deletedAt:null,isActive:true},select:{id:true,name:true,province:{select:{id:true,name:true}},members:{where:{isManager:true,startedAt:{lte:new Date()},OR:[{endedAt:null},{endedAt:{gt:new Date()}}]},select:{user:{select:{id:true,name:true}}}},specialties:{select:{specialty:{select:{id:true,name:true}}}},products:{select:{product:{select:{id:true,name:true}}}}},orderBy:{name:'asc'}}),
      this.db.specialty.findMany({where:{organizationId,deletedAt:null},select:{id:true,name:true},orderBy:{name:'asc'}}),
      this.db.product.findMany({where:{organizationId,deletedAt:null,isActive:true},select:{id:true,name:true},orderBy:{name:'asc'}}),
      this.db.user.findMany({where:{organizationId,deletedAt:null,roles:{some:{role:{code:'REP'}}}},select:{id:true,name:true,username:true,status:true,teamMemberships:{where:{isManager:false,startedAt:{lte:new Date()},OR:[{endedAt:null},{endedAt:{gt:new Date()}}],team:{organizationId,deletedAt:null,isActive:true}},select:{team:{select:{id:true,name:true}}}}},orderBy:{name:'asc'}}),
    ]);
    return {provinces,managers,teams,specialties,products,reps,repCount:reps.filter(r=>r.status==='ACTIVE').length};
  }
  async coverage(user:AuthUser){
    const organizationId=await this.org(user,'analytics.view_national');
    const cycles=await this.db.cycle.findMany({where:{organizationId,status:'ACTIVE'},orderBy:{startsAt:'desc'}});
    const cycle=cycles.find(c=>{const today=dateInZone(new Date(),c.timezone);return c.startsAt.toISOString().slice(0,10)<=today&&c.endsAt.toISOString().slice(0,10)>=today;});
    if(!cycle)return {cycle:null,provinces:[],physicalVisits:0,unallocatedVisits:0};
    const today=new Date(`${dateInZone(new Date(),cycle.timezone)}T00:00:00Z`);
    const scopes=await this.db.teamScopeTarget.findMany({where:{teamPeriod:{startedAt:{lte:today},scopeConfigured:true,team:{organizationId,deletedAt:null,isActive:true},repCycleProfile:{organizationId,cycleId:cycle.id}}},include:{teamPeriod:{select:{teamId:true,team:{select:{provinceId:true}}}},repCycleTarget:{select:{id:true,targetId:true,repCycleProfile:{select:{repId:true}}}},credits:{where:{visit:{organizationId,cycleId:cycle.id,status:'COMPLETED'}},select:{visitId:true}}}});
    const provinces=await this.db.province.findMany({where:{organizationId,deletedAt:null},select:{id:true,name:true},orderBy:{name:'asc'}});
    const [physicalVisits,unallocatedVisits]=await Promise.all([this.db.visit.count({where:{organizationId,cycleId:cycle.id,status:'COMPLETED'}}),this.db.visit.count({where:{organizationId,cycleId:cycle.id,status:'COMPLETED',teamCredits:{none:{}}}})]);
    const items=provinces.map(p=>{
      const rows=scopes.filter(s=>s.teamPeriod.team.provinceId===p.id);
      const obligations=new Map<string,{required:number;visits:Set<string>}>();
      for(const row of rows){const key=`${row.teamPeriod.teamId}:${row.repCycleTarget.id}`;const value=obligations.get(key)??{required:0,visits:new Set<string>()};value.required=Math.max(value.required,row.requiredVisits);row.credits.forEach(c=>value.visits.add(c.visitId));obligations.set(key,value);}
      let required=0,achieved=0,unvisited=0,incomplete=0;
      for(const row of obligations.values()){required+=row.required;achieved+=Math.min(row.required,row.visits.size);if(row.required>0&&row.visits.size===0)unvisited++;else if(row.visits.size<row.required)incomplete++;}
      return {...p,assignedTargets:new Set(rows.map(r=>r.repCycleTarget.targetId)).size,reps:new Set(rows.map(r=>r.repCycleTarget.repCycleProfile.repId)).size,physicalVisits:new Set(rows.flatMap(r=>r.credits.map(c=>c.visitId))).size,required,remaining:required-achieved,coverage:required?Math.round(achieved/required*100):null,unvisited,incomplete};
    });
    return {cycle:{id:cycle.id,name:cycle.name},provinces:items,physicalVisits,unallocatedVisits};
  }
  async cycleOptions(user:AuthUser){
    const organizationId=await this.org(user,'cycles.configure');
    const classes=await this.db.targetClass.findMany({where:{organizationId,isActive:true},select:{id:true,code:true,name:true},orderBy:{rank:'asc'}});
    const cycles=await this.db.cycle.findMany({where:{organizationId},select:{id:true,name:true,startsAt:true,endsAt:true,status:true},orderBy:{startsAt:'desc'}});
    return {classes,cycles};
  }
  async createClass(user:AuthUser,dto:CompanyClassDto){
    const organizationId=await this.org(user,'cycles.configure');
    const code=dto.code.trim(),name=dto.name.trim();
    if(!code||!name)throw new BadRequestException('رمز التصنيف واسمه مطلوبان.');
    return this.write(async db=>{
      const duplicate=await db.targetClass.findFirst({where:{organizationId,code:{equals:code,mode:'insensitive'}}});
      if(duplicate)throw new ConflictException('رمز التصنيف موجود مسبقاً.');
      const max=await db.targetClass.aggregate({where:{organizationId},_max:{rank:true}});
      const row=await db.targetClass.create({data:{organizationId,code,name,rank:(max._max.rank??0)+1}});
      await db.auditLog.create({data:{organizationId,actorId:user.id,action:'CREATE',entityType:'TargetClass',entityId:row.id,afterData:{code,name}}});
      return {id:row.id,code,name};
    });
  }
  async createCycle(user:AuthUser,dto:CreateCompanyCycleDto){
    const organizationId=await this.org(user,'cycles.configure');
    if((await this.db.organizationSettings.findUnique({where:{organizationId}}))?.cycleSchedule)throw new ConflictException('الشركة تستخدم الجدول الدوري؛ الفترات تُنشأ تلقائياً.');
    const start=new Date(dto.startsOn+'T00:00:00Z'),end=new Date(dto.endsOn+'T00:00:00Z');
    if(!dto.name.trim()||!Number.isFinite(+start)||!Number.isFinite(+end)||start.toISOString().slice(0,10)!==dto.startsOn||end.toISOString().slice(0,10)!==dto.endsOn||start>end||(+end-+start)/86400000>3660)throw new BadRequestException('اسم السايكل أو مدته غير صالح.');
    if(!dto.frequency.length||new Set(dto.frequency.map(x=>x.id)).size!==dto.frequency.length||dto.frequency.some(x=>!Number.isInteger(x.requiredVisits)||x.requiredVisits<1||x.requiredVisits>365)||dto.workingDays.length!==7||new Set(dto.workingDays.map(x=>x.weekday)).size!==7||dto.workingDays.some(x=>!Number.isInteger(x.weekday)||x.weekday<0||x.weekday>6)||!dto.workingDays.some(x=>x.isWorking))throw new BadRequestException('تحقق من التكرار وأيام العمل.');
    return this.write(async db=>{
      const classes=await db.targetClass.findMany({where:{organizationId,isActive:true},select:{id:true}});
      if(classes.length!==dto.frequency.length||classes.some(c=>!dto.frequency.some(f=>f.id===c.id)))throw new BadRequestException('حدد تكرار جميع تصنيفات الشركة الحالية.');
      const overlap=await db.cycle.findFirst({where:{organizationId,status:{in:['ACTIVE','DRAFT']},startsAt:{lte:end},endsAt:{gte:start}}});
      if(overlap)throw new ConflictException('المدة تتداخل مع سايكل قائم.');
      const settings=await db.organizationSettings.findUnique({where:{organizationId}});
      const row=await db.cycle.create({data:{organizationId,name:dto.name.trim(),timezone:settings?.timezone??'Asia/Damascus',startsAt:start,endsAt:end,status:'ACTIVE',classRules:{create:dto.frequency.map(f=>({targetClassId:f.id,requiredVisits:f.requiredVisits}))},workingDays:{create:dto.workingDays.map(d=>({weekday:d.weekday,isWorking:d.isWorking}))}}});
      await db.auditLog.create({data:{organizationId,actorId:user.id,action:'CREATE',entityType:'Cycle',entityId:row.id,afterData:{name:row.name,startsOn:dto.startsOn,endsOn:dto.endsOn,frequency:dto.frequency.map(f=>({id:f.id,requiredVisits:f.requiredVisits})),workingDays:dto.workingDays.map(d=>({weekday:d.weekday,isWorking:d.isWorking}))}}});
      return {id:row.id,name:row.name};
    });
  }
  async province(user:AuthUser,dto:ProvinceDto){
    const organizationId=await this.org(user,'areas.manage');
    if(!dto.name.trim())throw new BadRequestException('اسم المحافظة مطلوب.');
    return this.write(async db=>{const row=await db.province.create({data:{organizationId,name:dto.name.trim()}});await db.auditLog.create({data:{organizationId,actorId:user.id,action:'CREATE',entityType:'Province',entityId:row.id,afterData:{name:row.name}}});return {id:row.id,name:row.name};});
  }
  async catalog(user:AuthUser,kind:'specialties'|'products',dto:ProvinceDto,id?:string){
    const organizationId=await this.org(user,kind==='specialties'?'specialties.manage':'products.manage');
    const name=dto.name.trim();
    if(!name)throw new BadRequestException('الاسم مطلوب.');
    return this.write(async db=>{
      const where={organizationId,deletedAt:null};
      const previous=id?(kind==='specialties'?await db.specialty.findFirst({where:{...where,id}}):await db.product.findFirst({where:{...where,id,isActive:true}})):null;
      if(id&&!previous)throw new ForbiddenException('العنصر غير متاح ضمن الشركة.');
      const duplicate=kind==='specialties'?await db.specialty.findFirst({where:{...where,name:{equals:name,mode:'insensitive'},...(id?{id:{not:id}}:{})}}):await db.product.findFirst({where:{...where,name:{equals:name,mode:'insensitive'},...(id?{id:{not:id}}:{})}});
      if(duplicate)throw new ConflictException('الاسم موجود مسبقاً ضمن الشركة.');
      const row=kind==='specialties'?(id?await db.specialty.update({where:{id},data:{name}}):await db.specialty.create({data:{organizationId,name}})):(id?await db.product.update({where:{id},data:{name}}):await db.product.create({data:{organizationId,name}}));
      await db.auditLog.create({data:{organizationId,actorId:user.id,action:id?'UPDATE':'CREATE',entityType:kind==='specialties'?'Specialty':'Product',entityId:row.id,...(previous?{beforeData:{name:previous.name}}:{}),afterData:{name}}});
      return {id:row.id,name:row.name};
    });
  }
  async manager(user:AuthUser,dto:ManagerAccountDto){
    const organizationId=await this.org(user,'users.manage');
    if(!dto.name.trim()||Buffer.byteLength(dto.password,'utf8')>72)throw new BadRequestException('تحقق من الاسم وطول كلمة المرور.');
    const passwordHash=await bcrypt.hash(dto.password,12);
    return this.write(async db=>{const role=await db.role.findUnique({where:{code:'TEAM_MANAGER'}});if(!role)throw new BadRequestException('دور مدير الفريق غير مهيأ.');const row=await db.user.create({data:{organizationId,name:dto.name.trim(),username:dto.username,passwordHash,roles:{create:{roleId:role.id}}},select:{id:true,name:true,username:true}});await db.auditLog.create({data:{organizationId,actorId:user.id,action:'CREATE',entityType:'TeamManager',entityId:row.id,afterData:{username:row.username}}});return row;});
  }
  async editManager(user:AuthUser,id:string,dto:ManagerIdentityDto){
    const organizationId=await this.org(user,'users.manage');
    const name=dto.name.trim();if(!name)throw new BadRequestException('اسم المدير مطلوب.');
    return this.write(async db=>{
      const before=await db.user.findFirst({where:{id,organizationId,status:'ACTIVE',deletedAt:null,roles:{some:{role:{code:'TEAM_MANAGER'}}}},select:{id:true,name:true,username:true}});
      if(!before)throw new ForbiddenException('المدير غير متاح ضمن الشركة.');
      const row=await db.user.update({where:{id},data:{name,username:dto.username},select:{id:true,name:true,username:true}});
      await db.auditLog.create({data:{organizationId,actorId:user.id,action:'UPDATE',entityType:'TeamManager',entityId:id,beforeData:before,afterData:row}});
      return row;
    });
  }
  async changeTeamManager(user:AuthUser,teamId:string,dto:ChangeTeamManagerDto){
    const organizationId=await this.org(user,'teams.manage');
    return this.write(async db=>{
      const now=new Date();
      const team=await db.team.findFirst({where:{id:teamId,organizationId,isActive:true,deletedAt:null}});
      const manager=await db.user.findFirst({where:{id:dto.managerId,organizationId,status:'ACTIVE',deletedAt:null,roles:{some:{role:{code:'TEAM_MANAGER'}}}}});
      if(!team||!manager)throw new ForbiddenException('الفريق أو المدير غير متاح ضمن الشركة.');
      const memberships=await db.teamMember.findMany({where:{teamId,isManager:true,OR:[{endedAt:null},{endedAt:{gt:now}}]}});
      if(memberships.some(m=>m.startedAt>now))throw new ConflictException('للفريق تغيير مدير مجدول؛ راجع التكليف أولاً.');
      const currentIds=[...new Set(memberships.map(m=>m.userId))].sort();
      if(currentIds.join()!==[...dto.expectedManagerIds].sort().join())throw new ConflictException('تغير مدير الفريق؛ حدّث الصفحة وأعد المحاولة.');
      if(currentIds.length===1&&currentIds[0]===dto.managerId)return {id:teamId};
      await db.teamMember.updateMany({where:{id:{in:memberships.map(m=>m.id)}},data:{endedAt:now}});
      await db.teamMember.create({data:{teamId,userId:dto.managerId,isManager:true,startedAt:now}});
      await db.auditLog.create({data:{organizationId,actorId:user.id,action:'UPDATE',entityType:'TeamManagerAssignment',entityId:teamId,beforeData:{managerIds:currentIds},afterData:{managerId:dto.managerId,effectiveAt:now.toISOString()}}});
      return {id:teamId};
    });
  }
  async team(user:AuthUser,dto:CompanyTeamDto){
    const organizationId=await this.org(user,'teams.manage');
    if(!dto.name.trim())throw new BadRequestException('اسم الفريق مطلوب.');
    return this.write(async db=>{
      const province=await db.province.findFirst({where:{id:dto.provinceId,organizationId,deletedAt:null}});
      const manager=await db.user.findFirst({where:{id:dto.managerId,organizationId,status:'ACTIVE',deletedAt:null,roles:{some:{role:{code:'TEAM_MANAGER'}}}}});
      const specialties=await db.specialty.count({where:{id:{in:dto.specialtyIds},organizationId,deletedAt:null}});
      const products=await db.product.count({where:{id:{in:dto.productIds},organizationId,deletedAt:null,isActive:true}});
      if(!province||!manager||specialties!==dto.specialtyIds.length||products!==dto.productIds.length)throw new ForbiddenException('المحافظة أو المدير أو البيانات المختارة خارج نطاق الشركة.');
      const row=await db.team.create({data:{organizationId,provinceId:province.id,name:dto.name.trim(),members:{create:{userId:manager.id,isManager:true}},specialties:{create:dto.specialtyIds.map(specialtyId=>({specialtyId}))},products:{create:dto.productIds.map(productId=>({productId}))}},select:{id:true,name:true}});
      await db.auditLog.create({data:{organizationId,actorId:user.id,action:'CREATE',entityType:'Team',entityId:row.id,afterData:{provinceId:province.id,managerId:manager.id,specialtyIds:dto.specialtyIds,productIds:dto.productIds}}});return row;
    });
  }
}
