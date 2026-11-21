import { RepModule } from '../rep/rep.module.js';
import { LeaveBalanceService } from './leave-balance.service.js';
import { CycleSettingsService } from './cycle-settings.service.js';
import { AreaManagementService } from './area-management.service.js';
import { TargetManagementService } from './target-management.service.js';
import { RepManagementService } from './rep-management.service.js';
import { TeamManagementService } from './team-management.service.js';
import { Module } from '@nestjs/common';
import { ManagerController } from './manager.controller.js';
import { ManagerService } from './manager.service.js';
@Module({
  imports: [RepModule],
  controllers: [ManagerController],
  providers: [
    ManagerService,
    LeaveBalanceService,
    CycleSettingsService,
    AreaManagementService,
    TeamManagementService,
    RepManagementService,
    TargetManagementService,
  ],
})
export class ManagerModule {}
