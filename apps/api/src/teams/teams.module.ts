import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller.js';
import { TeamAssignmentService } from './team-assignment.service.js';
import { TeamReportService } from './team-report.service.js';
@Module({
  controllers: [TeamsController],
  providers: [TeamAssignmentService, TeamReportService],
})
export class TeamsModule {}
