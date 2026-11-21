import { Injectable, type NestInterceptor, type ExecutionContext, type CallHandler } from '@nestjs/common';
import { RecurringCycleService } from './recurring-cycle.service.js';
import { PrismaService } from '../database/prisma.service.js';
@Injectable()
export class RecurringCycleInterceptor implements NestInterceptor {
 constructor(private readonly cycles:RecurringCycleService,private readonly db:PrismaService){}
 async intercept(context:ExecutionContext,next:CallHandler){
  const request=context.switchToHttp().getRequest();const actor=request.user;
  // Setup remains available to repair configuration even if rollover cannot proceed.
  if(actor?.organizationId&&!request.url.includes('/sales/')&&(!request.url.includes('/company/setup')||request.url.includes('/company/setup/coverage'))&&await this.db.user.findFirst({where:{id:actor.sub??actor.id,organizationId:actor.organizationId,status:'ACTIVE',deletedAt:null},select:{id:true}}))await this.cycles.ensure(actor.organizationId);
  return next.handle();
 }
}
