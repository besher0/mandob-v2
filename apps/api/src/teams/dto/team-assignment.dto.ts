import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
export class TeamAssignmentDto {
  @IsUUID() repCycleProfileId: string;
  @IsUUID() teamId: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  areaIds: string[];
  @Matches(/^\d{4}-\d{2}-\d{2}$/) startsOn: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) endsOn: string;
}
export class TeamVisitsQueryDto {
  @IsOptional() @IsUUID() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number =
    30;
}
