import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
export class ReportQueryDto {
  @IsIn(['DAILY', 'WEEKLY', 'CUSTOM']) period: 'DAILY' | 'WEEKLY' | 'CUSTOM';
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
}
export class SaveReportDto extends ReportQueryDto {
  @IsUUID() clientRef: string;
}
export class RequestLeaveDto {
  @IsUUID() clientRef: string;
  @IsIn(['ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID']) type:
    'ANNUAL' | 'SICK' | 'EMERGENCY' | 'UNPAID';
  @Matches(/^\d{4}-\d{2}-\d{2}$/) from: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) to: string;
  @IsOptional() @IsString() @MaxLength(4000) reason?: string;
}
