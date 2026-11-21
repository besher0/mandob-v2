import {
  IsNumber,
  Max,
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Min,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class RegisterRoundDto {
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @IsOptional() @IsNumber() @Min(0) accuracy?: number;
  @IsOptional() @IsString() @MaxLength(40) locationCapturedAt?: string;
  @IsOptional() @IsString() @MaxLength(500) locationReason?: string;

  @IsUUID() clientRef: string;
  @IsUUID() cycleId: string;
  @IsIn(['DOCTOR', 'PHARMACY', 'HOSPITAL']) type:
    'DOCTOR' | 'PHARMACY' | 'HOSPITAL';
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
  targetIds: string[];
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  productIds: string[];
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) visitDate: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

export class TargetsQueryDto {
  @IsOptional()
  @IsString()
  @Matches(
    /^(INDEPENDENT|UNION|CLINIC|HOSPITAL|GOVERNMENT)(,(INDEPENDENT|UNION|CLINIC|HOSPITAL|GOVERNMENT))*$/,
  )
  affiliations?: string;
  @IsOptional()
  @IsString()
  @Matches(
    /^(PUBLIC|PRIVATE|SPECIALIZED|MEDICAL_CENTER)(,(PUBLIC|PRIVATE|SPECIALIZED|MEDICAL_CENTER))*$/,
  )
  kinds?: string;
  @IsOptional() @IsIn(['DOCTOR', 'PHARMACY', 'HOSPITAL']) type?:
    'DOCTOR' | 'PHARMACY' | 'HOSPITAL';
  @IsOptional() @IsString() @MaxLength(200) search?: string;
  @IsOptional() @IsString() @MaxLength(8000) areaIds?: string;
  @IsOptional() @IsString() @MaxLength(8000) classIds?: string;
  @IsOptional() @IsString() @MaxLength(8000) specialtyIds?: string;
  @IsOptional() @IsIn(['true', 'false']) unvisited?: string;
}

export class EditRoundDto extends RegisterRoundDto {
  @IsInt() @Min(0) revision: number;
}

export class CancelRoundDto {
  @IsInt() @Min(0) revision: number;
}
