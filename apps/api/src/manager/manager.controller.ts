import {
  LeaveBalanceService,
  LeaveBalanceDto,
} from './leave-balance.service.js';
import {
  CycleSettingsService,
  CycleSettingsDto,
} from './cycle-settings.service.js';
import {
  AreaManagementService,
  AreaDto,
  AreaGroupDto,
} from './area-management.service.js';
import { TargetManagementService } from './target-management.service.js';
import { ManagedTargetDto, DeleteTargetsDto } from './target-management.dto.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { RepManagementService } from './rep-management.service.js';
import { CreateRepDto, RepAssignmentDto } from './rep-management.dto.js';
import { TeamManagementService } from './team-management.service.js';
import {
  CreateManagedTeamDto,
  ManagedTeamDto,
  ManagedTeamRepsDto,
} from './team-management.dto.js';
import {
  Body,
  StreamableFile,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ManagerService } from './manager.service.js';
class LeaveDecisionDto {
  @IsIn(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(2000) reviewNote?: string;
}
@Controller('manager')
export class ManagerController {
  constructor(
    private readonly service: ManagerService,
    private readonly leaveBalances: LeaveBalanceService,
    private readonly cycleSettings: CycleSettingsService,
    private readonly areaManagement: AreaManagementService,
    private readonly targets: TargetManagementService,
    private readonly reps: RepManagementService,
    private readonly teamManagement: TeamManagementService,
  ) {}
  @Patch('leave-default')
  @RequirePermissions('leaves.configure')
  saveLeaveDefault(
    @CurrentUser() user: AuthUser,
    @Body() dto: LeaveBalanceDto,
  ) {
    return this.leaveBalances.save(user, dto);
  }
  @Get('reps/:id/leave-balance')
  @RequirePermissions('leaves.manage_balances')
  repLeaveBalance(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leaveBalances.get(user, id);
  }
  @Patch('reps/:id/leave-balance')
  @RequirePermissions('leaves.manage_balances')
  saveRepLeaveBalance(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveBalanceDto,
  ) {
    return this.leaveBalances.save(user, dto, id);
  }
  @Patch('cycles/:id/settings')
  @RequirePermissions('cycles.configure')
  saveCycleSettings(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CycleSettingsDto,
  ) {
    return this.cycleSettings.save(user, id, dto);
  }
  @Get('area-catalog')
  @RequirePermissions('areas.view')
  areaCatalog(@CurrentUser() user: AuthUser) {
    return this.areaManagement.catalog(user);
  }
  @Post('area-groups')
  @RequirePermissions('areas.manage_own')
  createAreaGroup(@CurrentUser() user: AuthUser, @Body() dto: AreaGroupDto) {
    return this.areaManagement.save(user, dto, 'group');
  }
  @Post('areas')
  @RequirePermissions('areas.manage_own')
  createArea(@CurrentUser() user: AuthUser, @Body() dto: AreaDto) {
    return this.areaManagement.save(user, dto, 'area');
  }
  @Patch('areas/:id')
  @RequirePermissions('areas.manage_own')
  updateArea(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AreaDto,
  ) {
    return this.areaManagement.save(user, dto, 'area', id);
  }
  @Get('target-options')
  @RequirePermissions('targets.view', 'areas.view', 'specialties.view')
  targetOptions(@CurrentUser() user: AuthUser, @Query('provinceId') provinceId?:string) {
    return this.targets.options(user,provinceId);
  }
  @Get('targets')
  @RequirePermissions('targets.view')
  targetList(@CurrentUser() user: AuthUser, @Query('type') type: string, @Query('provinceId') provinceId?:string) {
    return this.targets.list(user, type,provinceId);
  }
  @Post('targets/bulk-delete')
  @RequirePermissions('targets.delete')
  deleteTargets(@CurrentUser() user: AuthUser, @Body() dto: DeleteTargetsDto, @Query('provinceId') provinceId?:string) {
    return this.targets.deleteMany(user, dto,provinceId);
  }
  @Post('targets')
  @RequirePermissions('targets.manage')
  createTarget(@CurrentUser() user: AuthUser, @Body() dto: ManagedTargetDto, @Query('provinceId') provinceId?:string) {
    return this.targets.save(user, dto,undefined,provinceId);
  }
  @Patch('targets/:id')
  @RequirePermissions('targets.manage')
  editTarget(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ManagedTargetDto,
    @Query('provinceId') provinceId?:string,
  ) {
    return this.targets.save(user, dto, id,provinceId);
  }
  @Get('doctors/export')
  @RequirePermissions('targets.view')
  async exportDoctors(
    @CurrentUser() user: AuthUser,
    @Query('template') template?: string,
    @Query('search') search?: string,
    @Query('areaId') areaId?: string,
    @Query('provinceId') provinceId?: string,
    @Query('specialtyOrder') specialtyOrder?: string,
  ) {
    const buffer = await this.targets.exportDoctors(user, template === 'true', search, areaId,provinceId,specialtyOrder);
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${template === 'true' ? 'doctors-template' : 'doctors'}.xlsx"`,
    });
  }
  @Post('doctors/import')
  @RequirePermissions('targets.manage')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    }),
  )
  importDoctors(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: { buffer: Buffer; originalname: string },
    @Query('provinceId') provinceId?:string,
  ) {
    return this.targets.importDoctors(user, file,provinceId);
  }
  @Get('rep-options')
  @RequirePermissions(
    'users.view',
    'areas.view',
    'products.view',
    'specialties.view',
  )
  repOptions(@CurrentUser() user: AuthUser) {
    return this.reps.options(user);
  }
  @Get('reps/:id/options')
  @RequirePermissions(
    'users.view',
    'areas.view',
    'products.view',
    'specialties.view',
  )
  repEditOptions(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reps.options(user, id);
  }
  @Post('reps')
  @RequirePermissions('users.manage_own')
  createRep(@CurrentUser() user: AuthUser, @Body() dto: CreateRepDto) {
    return this.reps.create(user, dto);
  }
  @Patch('reps/:id')
  @RequirePermissions('users.manage_own')
  updateRep(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RepAssignmentDto,
  ) {
    return this.reps.update(user, id, dto);
  }
  @Get('team-options')
  @RequirePermissions('teams.create_own')
  createTeamOptions(@CurrentUser() user: AuthUser) {
    return this.teamManagement.createOptions(user);
  }
  @Post('teams')
  @RequirePermissions('teams.create_own')
  createTeam(@CurrentUser() user: AuthUser, @Body() dto: CreateManagedTeamDto) {
    return this.teamManagement.create(user, dto);
  }
  @Get('teams/:id/options')
  @RequirePermissions('teams.view', 'products.view', 'specialties.view')
  teamOptions(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.teamManagement.options(user, id);
  }
  @Get('teams/:id/reps')
  @RequirePermissions('teams.view', 'users.view', 'areas.view')
  teamReps(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.teamManagement.reps(user, id);
  }
  @Patch('teams/:id')
  @RequirePermissions('teams.configure_own')
  updateTeam(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ManagedTeamDto,
  ) {
    return this.teamManagement.update(user, id, dto);
  }
  @Patch('teams/:id/reps')
  @RequirePermissions('teams.assign_own')
  assignReps(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ManagedTeamRepsDto,
  ) {
    return this.teamManagement.saveReps(user, id, dto);
  }
  @Get('workspace')
  @RequirePermissions(
    'teams.view',
    'analytics.view_team',
    'visits.view_team',
    'targets.view',
    'products.view',
    'areas.view',
    'users.view',
  )
  workspace(@CurrentUser() user: AuthUser) {
    return this.service.workspace(user);
  }
  @Get('reports')
  @RequirePermissions('reports.view_team')
  reports(@CurrentUser() user: AuthUser) {
    return this.service.reports(user);
  }
  @Get('leaves')
  @RequirePermissions('leaves.approve_team')
  leaves(@CurrentUser() user: AuthUser) {
    return this.service.leaves(user);
  }
  @Patch('leaves/:id')
  @RequirePermissions('leaves.approve_team')
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveDecisionDto,
  ) {
    return this.service.decideLeave(user, id, dto.status, dto.reviewNote);
  }
}
