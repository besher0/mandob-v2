import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Permissions } from '../common/decorators/permissions.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { RepDashboardService } from './rep-dashboard.service.js';
import { OverdueQueryDto } from './dto/overdue-query.dto.js';

@Controller('rep')
export class RepDashboardController {
  constructor(
    private readonly dashboardService: RepDashboardService,
  ) {}

  @Get('dashboard')
  @Permissions('analytics.view_own')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.dashboardService.dashboard(user);
  }

  @Get('cycle-progress')
  @Permissions('cycles.view')
  cycleProgress(@CurrentUser() user: AuthUser) {
    return this.dashboardService.cycleProgress(user);
  }

  @Get('weekly-summary')
  @Permissions('reports.view_own')
  weeklySummary(@CurrentUser() user: AuthUser) {
    return this.dashboardService.weeklySummary(user);
  }

  @Get('overdue-doctors')
  @Permissions('targets.view')
  overdueDoctors(
    @CurrentUser() user: AuthUser,
    @Query() query: OverdueQueryDto,
  ) {
    return this.dashboardService.overdueDoctors(
      user,
      query.limit,
    );
  }
}
