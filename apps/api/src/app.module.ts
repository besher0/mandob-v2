import { SalesModule } from './sales/sales.module.js';
import { HttpErrorFilter } from './security/http-error.filter.js';
import { RequestLimits, RequestCapacityInterceptor } from './security/request-limits.js';
import { RecurringCycleInterceptor } from './cycles/recurring-cycle.interceptor.js';
import { CompanyModule } from './company/company.module.js';
import { PlatformModule } from './platform/platform.module.js';
import { ManagerModule } from './manager/manager.module.js';
import { TeamsModule } from './teams/teams.module.js';
import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { RepModule } from './rep/rep.module.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { PermissionsGuard } from './common/guards/permissions.guard.js';

@Module({
  imports: [
    SalesModule,
    ManagerModule,
    PlatformModule,
    CompanyModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AuthModule,
    RepModule,
    TeamsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    RequestLimits,
    { provide: APP_FILTER, useClass: HttpErrorFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestCapacityInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RecurringCycleInterceptor },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
