import {
  IsIn,
  IsArray,
  ArrayUnique,
  ArrayMinSize,
  ArrayMaxSize,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
export class ManagedTargetDto {
  @IsIn(['DOCTOR', 'PHARMACY', 'HOSPITAL']) type:
    'DOCTOR' | 'PHARMACY' | 'HOSPITAL';
  @IsString() @MinLength(1) @MaxLength(180) name: string;
  @IsUUID() areaId: string;
  @IsUUID() targetClassId: string;
  @IsOptional() @IsUUID() specialtyId?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional()
  @IsIn(['INDEPENDENT', 'UNION', 'CLINIC', 'HOSPITAL', 'GOVERNMENT'])
  affiliation?: 'INDEPENDENT' | 'UNION' | 'CLINIC' | 'HOSPITAL' | 'GOVERNMENT';
  @IsOptional()
  @IsIn(['PUBLIC', 'PRIVATE', 'SPECIALIZED', 'MEDICAL_CENTER'])
  kind?: 'PUBLIC' | 'PRIVATE' | 'SPECIALIZED' | 'MEDICAL_CENTER';
}

export class DeleteTargetsDto {
  @IsIn(['DOCTOR', 'PHARMACY', 'HOSPITAL']) type:
    'DOCTOR' | 'PHARMACY' | 'HOSPITAL';
  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  ids: string[];
}
