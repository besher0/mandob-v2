import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { PlatformService } from './platform.service.js';
import { BrandingDto, CreateCompanyDto } from './platform.dto.js';
@Controller('platform/companies')
class PlatformController {
  constructor(private readonly service: PlatformService) {}
  @Get() list(@CurrentUser() user: AuthUser) { return this.service.list(user); }
  @Post() create(@CurrentUser() user: AuthUser, @Body() dto: CreateCompanyDto) { return this.service.create(user, dto); }
  @Get(':id/branding') branding(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.service.branding(user, id); }
  @Patch(':id/branding') save(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BrandingDto) { return this.service.saveBranding(user, id, dto); }
}
@Controller('company')
class CompanyBrandingController {
  constructor(private readonly service: PlatformService) {}
  @Get('branding') own(@CurrentUser() user: AuthUser) { return this.service.ownBranding(user); }
}
@Module({ controllers: [PlatformController, CompanyBrandingController], providers: [PlatformService] })
export class PlatformModule {}
