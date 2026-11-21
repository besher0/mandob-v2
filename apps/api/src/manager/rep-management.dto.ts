import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
export class RepAssignmentDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsUUID() teamId: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  areaIds: string[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  productIds: string[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  specialtyIds: string[];
  @IsInt() @Min(1) @Max(500) dailyVisitTarget: number;
}
export class CreateRepDto extends RepAssignmentDto {
  @IsString() @Matches(/^[a-zA-Z0-9_.-]{3,80}$/) username: string;
  @IsString() @MinLength(8) @MaxLength(72) password: string;
}
