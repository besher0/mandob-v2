import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import { RepActivityService, type Upload } from './rep-activity.service.js';
import {
  ReportQueryDto,
  SaveReportDto,
  RequestLeaveDto,
} from './dto/activity.dto.js';
@Controller()
export class RepActivityController {
  constructor(private readonly service: RepActivityService) {}
  @Get('rep/reports/preview')
  @RequirePermissions('reports.view_own')
  preview(@CurrentUser() user: AuthUser, @Query() query: ReportQueryDto) {
    return this.service.reportPreview(user, query);
  }
  @Get('rep/reports')
  @RequirePermissions('reports.view_own')
  reports(@CurrentUser() user: AuthUser) {
    return this.service.reports(user);
  }
  @Post('rep/reports')
  @RequirePermissions('reports.view_own')
  save(@CurrentUser() user: AuthUser, @Body() dto: SaveReportDto) {
    return this.service.saveReport(user, dto);
  }
  @Get('management/teams/:teamId/reports')
  @RequirePermissions('reports.view_team')
  team(
    @CurrentUser() user: AuthUser,
    @Param('teamId', ParseUUIDPipe) teamId: string,
  ) {
    return this.service.teamReports(user, teamId);
  }
  @Get('rep/leaves')
  @RequirePermissions('leaves.view_own')
  leaves(@CurrentUser() user: AuthUser) {
    return this.service.leaves(user);
  }
  @Post('rep/leaves')
  @RequirePermissions('leaves.request')
  @UseInterceptors(
    FileInterceptor('attachment', {
      limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 },
    }),
  )
  leave(
    @CurrentUser() user: AuthUser,
    @Body() dto: RequestLeaveDto,
    @UploadedFile() file?: Upload,
  ) {
    return this.service.requestLeave(user, dto, file);
  }
  @Get('rep/leave-attachments/:id')
  @RequirePermissions('leaves.view_own')
  async attachment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const file = await this.service.attachment(user, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.send(Buffer.from(file.content));
  }
}
