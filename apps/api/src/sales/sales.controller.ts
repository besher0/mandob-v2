import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { SalesCatalogService } from './sales-catalog.service.js';
import { SalesRecordsService } from './sales-records.service.js';
import {
  SalesAccountDto,
  SalesAgentDto,
  SalesOrderDto,
  SalesReviewDto,
  SalesVisitDto,
} from './sales.dto.js';

function pageNumber(value?: string) {
  const page = Number(value ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > 100000)
    throw new BadRequestException('رقم الصفحة غير صالح.');
  return page;
}
@Controller('sales')
export class SalesController {
  constructor(
    private readonly catalog: SalesCatalogService,
    private readonly records: SalesRecordsService,
  ) {}
  @Get('options') options(
    @CurrentUser() user: AuthUser,
    @Query('provinceId') provinceId?: string,
  ) {
    if (provinceId && !isUUID(provinceId)) throw new BadRequestException();
    return this.catalog.options(user, provinceId);
  }
  @Post('agents') agent(
    @CurrentUser() user: AuthUser,
    @Body() dto: SalesAgentDto,
  ) {
    return this.catalog.agent(user, dto);
  }
  @Post('accounts') account(
    @CurrentUser() user: AuthUser,
    @Body() dto: SalesAccountDto,
  ) {
    return this.catalog.account(user, dto);
  }
  @Get('visits') visits(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
  ) {
    return this.records.visits(user, pageNumber(page));
  }
  @Get('orders') orders(
    @CurrentUser() user: AuthUser,
    @Query('page') page?: string,
  ) {
    return this.records.orders(user, pageNumber(page));
  }
  @Post('visits') visit(
    @CurrentUser() user: AuthUser,
    @Body() dto: SalesVisitDto,
  ) {
    return this.records.visit(user, dto);
  }
  @Post('orders') order(
    @CurrentUser() user: AuthUser,
    @Body() dto: SalesOrderDto,
  ) {
    return this.records.order(user, dto);
  }
  @Patch('orders/:id/review') review(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalesReviewDto,
  ) {
    return this.records.review(user, id, dto);
  }
}
