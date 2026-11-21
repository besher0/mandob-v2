import { IsOptional, IsIn, IsInt, IsString, Matches, MaxLength, MinLength, Min, Max } from 'class-validator';
export class BrandingDto {
  @IsOptional() @IsIn(["DISABLED", "OPTIONAL", "REQUIRED"]) roundLocationPolicy?: string;
  @IsOptional() @IsIn(['CLASSIC', 'ATLAS', 'DIWAN', 'PEARL']) layout?: string;
  @IsString() @MinLength(1) @MaxLength(100) displayName: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) accent?: string;
  @Matches(/^#[0-9a-fA-F]{6}$/) primary: string;
  @Matches(/^#[0-9a-fA-F]{6}$/) sidebar: string;
  @Matches(/^#[0-9a-fA-F]{6}$/) background: string;
  @IsIn(['Tahoma', 'Arial', 'Cairo', 'Almarai']) font: string;
  @IsIn(['CLASSIC', 'SQUARE', 'SOFT']) style: string;
  @IsString() @MaxLength(60000) @Matches(/^(|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*)$/) logo: string;
  @IsInt() @Min(0) @Max(2147483646) revision: number;
}
export class CreateCompanyDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @Matches(/^[a-z0-9][a-z0-9-]{1,39}$/) code: string;
  @IsString() @MinLength(1) @MaxLength(100) ownerName: string;
  @Matches(/^[A-Za-z0-9._-]{3,80}$/) username: string;
  @IsString() @MinLength(10) @MaxLength(72) password: string;
}
