import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  CompanyRolesService,
  CompanyRoleDto,
  EditCompanyRoleDto,
  CreateStaffDto,
  EditStaffDto,
} from './company-roles.service.js';
@Controller('company')
export class CompanyRolesController {
  constructor(private readonly service: CompanyRolesService) {}
  @Get('staff-workspace') workspace(@CurrentUser() user: AuthUser) {
    return this.service.staffWorkspace(user);
  }
  @Get('access') options(@CurrentUser() user: AuthUser) {
    return this.service.options(user);
  }
  @Post('access/roles') role(
    @CurrentUser() user: AuthUser,
    @Body() dto: CompanyRoleDto,
  ) {
    return this.service.role(user, dto);
  }
  @Patch('access/roles/:id') editRole(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditCompanyRoleDto,
  ) {
    return this.service.role(user, dto, id, dto.revision);
  }
  @Post('access/staff') staff(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStaffDto,
  ) {
    return this.service.createStaff(user, dto);
  }
  @Patch('access/staff/:id') editStaff(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditStaffDto,
  ) {
    return this.service.editStaff(user, id, dto);
  }
}
@Controller('platform/companies/:companyId/access')
export class PlatformRolesController {
  constructor(private readonly service: CompanyRolesService) {}
  @Get() options(
    @CurrentUser() user: AuthUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
  ) {
    return this.service.options(user, companyId);
  }
  @Post('roles') role(
    @CurrentUser() user: AuthUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CompanyRoleDto,
  ) {
    return this.service.role(user, dto, undefined, undefined, companyId);
  }
  @Patch('roles/:id') editRole(
    @CurrentUser() user: AuthUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditCompanyRoleDto,
  ) {
    return this.service.role(user, dto, id, dto.revision, companyId);
  }
  @Post('staff') staff(
    @CurrentUser() user: AuthUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateStaffDto,
  ) {
    return this.service.createStaff(user, dto, companyId);
  }
  @Patch('staff/:id') editStaff(
    @CurrentUser() user: AuthUser,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditStaffDto,
  ) {
    return this.service.editStaff(user, id, dto, companyId);
  }
}
