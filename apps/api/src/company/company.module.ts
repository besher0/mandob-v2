import { CompanyRolesController, PlatformRolesController } from './company-roles.controller.js';
import { CompanyRolesService } from './company-roles.service.js';
import { RecurringCycleService, ScheduleDto } from '../cycles/recurring-cycle.service.js';
import { Body, Controller, Get, Module, Post, Patch, Param, ParseUUIDPipe } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CompanyService, ProvinceDto, ManagerAccountDto, CompanyTeamDto, CreateCompanyCycleDto, CompanyClassDto, ManagerIdentityDto, ChangeTeamManagerDto } from './company.service.js';
@Controller('company/setup')
class CompanyController {
  constructor(private readonly service:CompanyService,private readonly recurring:RecurringCycleService){}
  @Get('cycle-schedule') schedule(@CurrentUser() user:AuthUser){return this.recurring.options(user);}
  @Patch('cycle-schedule') saveSchedule(@CurrentUser() user:AuthUser,@Body() dto:ScheduleDto){return this.recurring.save(user,dto,dto);}
  @Get('cycles') cycles(@CurrentUser() user:AuthUser){return this.service.cycleOptions(user);}
  @Post('cycles') createCycle(@CurrentUser() user:AuthUser,@Body() dto:CreateCompanyCycleDto){return this.service.createCycle(user,dto);}
  @Post('classes') createClass(@CurrentUser() user:AuthUser,@Body() dto:CompanyClassDto){return this.service.createClass(user,dto);}
  @Post('specialties') specialty(@CurrentUser() user:AuthUser,@Body() dto:ProvinceDto){return this.service.catalog(user,'specialties',dto);}
  @Post('products') product(@CurrentUser() user:AuthUser,@Body() dto:ProvinceDto){return this.service.catalog(user,'products',dto);}
  @Patch('specialties/:id') editSpecialty(@CurrentUser() user:AuthUser,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ProvinceDto){return this.service.catalog(user,'specialties',dto,id);}
  @Patch('products/:id') editProduct(@CurrentUser() user:AuthUser,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ProvinceDto){return this.service.catalog(user,'products',dto,id);}
  @Get('coverage') coverage(@CurrentUser() user:AuthUser){return this.service.coverage(user);}
  @Get() workspace(@CurrentUser() user:AuthUser){return this.service.workspace(user);}
  @Post('provinces') province(@CurrentUser() user:AuthUser,@Body() dto:ProvinceDto){return this.service.province(user,dto);}
  @Post('managers') manager(@CurrentUser() user:AuthUser,@Body() dto:ManagerAccountDto){return this.service.manager(user,dto);}
  @Patch('managers/:id') editManager(@CurrentUser() user:AuthUser,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ManagerIdentityDto){return this.service.editManager(user,id,dto);}
  @Patch('teams/:id/manager') changeManager(@CurrentUser() user:AuthUser,@Param('id',ParseUUIDPipe) id:string,@Body() dto:ChangeTeamManagerDto){return this.service.changeTeamManager(user,id,dto);}
  @Post('teams') team(@CurrentUser() user:AuthUser,@Body() dto:CompanyTeamDto){return this.service.team(user,dto);}
}
@Module({controllers:[CompanyController,CompanyRolesController,PlatformRolesController],providers:[CompanyService,RecurringCycleService,CompanyRolesService],exports:[RecurringCycleService]})
export class CompanyModule{}
