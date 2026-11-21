import { RepAnalyticsService } from './rep-analytics.service.js';
import { RepNotificationsService } from './rep-notifications.service.js';
import { RepInsightsController } from './rep-insights.controller.js';
import { RepActivityService } from './rep-activity.service.js';
import { RepActivityController } from './rep-activity.controller.js';
import { Module } from '@nestjs/common';
import { RepDashboardController } from './rep-dashboard.controller.js';
import { RepDashboardService } from './rep-dashboard.service.js';

import { RepWorkspaceService } from './rep-workspace.service.js';
import { RepWorkspaceController } from './rep-workspace.controller.js';

@Module({
  exports: [RepActivityService],
  controllers: [
    RepInsightsController,
    RepActivityController,
    RepDashboardController,
    RepWorkspaceController,
  ],
  providers: [
    RepAnalyticsService,
    RepNotificationsService,
    RepActivityService,
    RepDashboardService,
    RepWorkspaceService,
  ],
})
export class RepModule {}
