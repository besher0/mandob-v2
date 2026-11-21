import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
export class ManagedTeamDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  specialtyIds: string[];
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  productIds: string[];
}
export class ManagedTeamRepsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  repCycleProfileIds: string[];
}

export class CreateManagedTeamDto extends ManagedTeamDto {
  @IsUUID() provinceId: string;
}
