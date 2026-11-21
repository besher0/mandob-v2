import { IsIn, IsOptional, IsUUID } from 'class-validator';
export class AnalyticsQueryDto {
  @IsOptional() @IsIn(['cycle', 'week', 'month']) period:
    'cycle' | 'week' | 'month' = 'cycle';
  @IsOptional() @IsUUID() areaId?: string;
  @IsOptional() @IsUUID() classId?: string;
}
