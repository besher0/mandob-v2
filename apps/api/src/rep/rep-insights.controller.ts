import { Controller, Get, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { AnalyticsQueryDto } from './dto/analytics-query.dto.js';
import { RepAnalyticsService } from './rep-analytics.service.js';
import { RepNotificationsService } from './rep-notifications.service.js';
@Controller('rep')
export class RepInsightsController {
  constructor(
    private readonly analyticsService: RepAnalyticsService,
    private readonly notificationsService: RepNotificationsService,
  ) {}
  @Get('analytics')
  @RequirePermissions('analytics.view_own')
  analytics(@CurrentUser() user: AuthUser, @Query() query: AnalyticsQueryDto) {
    return this.analyticsService.analytics(user, query);
  }
  @Get('notifications')
  @RequirePermissions('notifications.view_own')
  notifications(@CurrentUser() user: AuthUser) {
    return this.notificationsService.list(user);
  }
}
