import { Type } from 'class-transformer';
import { IsArray, IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class CreateReturnOrderLineDto {
  @IsString()
  lineNumber!: string;

  @IsString()
  skuReference!: string;

  @IsInt()
  @Min(1)
  expectedQuantity!: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CreateReturnOrderDto {
  @IsString()
  rmaNumber!: string;

  @IsOptional()
  @IsString()
  ownerClientReference?: string;

  @IsOptional()
  @IsString()
  customerReference?: string;

  @IsOptional()
  @IsString()
  externalReference?: string;

  @IsOptional()
  @IsString()
  reasonCode?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateReturnOrderLineDto)
  lines!: CreateReturnOrderLineDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
