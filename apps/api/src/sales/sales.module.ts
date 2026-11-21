import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller.js';
import { SalesAccessService } from './sales-access.service.js';
import { SalesCatalogService } from './sales-catalog.service.js';
import { SalesRecordsService } from './sales-records.service.js';
@Module({
  controllers: [SalesController],
  providers: [SalesAccessService, SalesCatalogService, SalesRecordsService],
})
export class SalesModule {}
