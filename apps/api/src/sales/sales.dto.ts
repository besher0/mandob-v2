import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SalesVisitDto {
  @IsUUID() clientRef: string;
  @IsUUID() provinceId: string;
  @IsUUID() targetId: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @IsString() @MaxLength(2000) notes: string;
}
export class SalesItemDto {
  @IsUUID() productId: string;
  @IsInt() @Min(1) @Max(1000000) quantity: number;
  @Matches(/^\d{1,10}(\.\d{1,2})?$/) unitPrice: string;
  @IsIn(['NONE', 'BONUS', 'DISCOUNT']) offerType: 'NONE' | 'BONUS' | 'DISCOUNT';
  @IsInt() @Min(0) @Max(1000000) bonusQuantity: number;
  @Matches(/^\d{1,3}(\.\d{1,2})?$/) discountPercent: string;
}
export class SalesOrderDto extends SalesVisitDto {
  @IsUUID() agentId: string;
  @IsOptional() @IsUUID() visitId?: string;
  @IsIn(['SYP']) currency: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SalesItemDto)
  items: SalesItemDto[];
}
export class SalesReviewDto {
  @IsIn(['APPROVED', 'REJECTED']) status: 'APPROVED' | 'REJECTED';
  @IsString() @MaxLength(2000) note: string;
}
export class SalesAgentDto {
  @IsUUID() provinceId: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
}
export class SalesAccountDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @Matches(/^[A-Za-z0-9._-]{3,80}$/) username: string;
  @IsString() @MinLength(10) @MaxLength(72) password: string;
}
