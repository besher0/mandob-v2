import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Patch,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { RepWorkspaceService } from './rep-workspace.service.js';
import {
  RegisterRoundDto,
  TargetsQueryDto,
  EditRoundDto,
  CancelRoundDto,
} from './dto/round.dto.js';

@Controller('rep')
export class RepWorkspaceController {
  constructor(private readonly service: RepWorkspaceService) {}
  @Get('workspace')
  @RequirePermissions('targets.view')
  workspace(@CurrentUser() user: AuthUser) {
    return this.service.workspace(user);
  }
  @Get('targets')
  @RequirePermissions('targets.view')
  targets(@CurrentUser() user: AuthUser, @Query() query: TargetsQueryDto) {
    return this.service.targets(user, query);
  }
  @Get('visit-history')
  @RequirePermissions('visits.view_own')
  history(@CurrentUser() user: AuthUser, @Query() query: TargetsQueryDto) {
    return this.service.history(user, query.type);
  }
  @Get('rounds/:id/edit')
  @RequirePermissions('rounds.manage_own', 'visits.edit_own')
  editDetails(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.editDetails(user, id);
  }
  @Post('rounds/:id/cancel')
  @RequirePermissions('rounds.manage_own', 'visits.edit_own')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelRoundDto,
  ) {
    return this.service.cancel(user, id, dto.revision);
  }
  @Patch('rounds/:id')
  @RequirePermissions('rounds.manage_own', 'visits.edit_own')
  edit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditRoundDto,
  ) {
    return this.service.register(user, dto, { id, revision: dto.revision });
  }
  @Post('rounds')
  @RequirePermissions('rounds.create', 'visits.create')
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterRoundDto) {
    return this.service.register(user, dto);
  }
}
