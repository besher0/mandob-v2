import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  TeamAssignmentDto,
  TeamVisitsQueryDto,
} from './dto/team-assignment.dto.js';
import { TeamAssignmentService } from './team-assignment.service.js';
import { TeamReportService } from './team-report.service.js';
@Controller('management')
export class TeamsController {
  constructor(
    private readonly assignments: TeamAssignmentService,
    private readonly reports: TeamReportService,
  ) {}
  @Post('team-assignments')
  @RequirePermissions('teams.manage', 'cycles.configure')
  assign(@CurrentUser() user: AuthUser, @Body() dto: TeamAssignmentDto) {
    return this.assignments.create(user, dto);
  }
  @Get('teams/:teamId/cycles/:cycleId/coverage')
  coverage(
    @CurrentUser() user: AuthUser,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
  ) {
    return this.reports.coverage(user, teamId, cycleId);
  }
  @Get('teams/:teamId/cycles/:cycleId/visits')
  visits(
    @CurrentUser() user: AuthUser,
    @Param('teamId', ParseUUIDPipe) teamId: string,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
    @Query() query: TeamVisitsQueryDto,
  ) {
    return this.reports.visits(user, teamId, cycleId, query);
  }
  @Get('company/cycles/:cycleId/summary')
  @RequirePermissions('analytics.view_national')
  summary(
    @CurrentUser() user: AuthUser,
    @Param('cycleId', ParseUUIDPipe) cycleId: string,
  ) {
    return this.reports.companySummary(user, cycleId);
  }
}
