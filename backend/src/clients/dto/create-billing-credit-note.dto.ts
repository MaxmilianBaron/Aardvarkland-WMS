import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateBillingCreditNoteDto {
  @ApiPropertyOptional({ example: 'CN-INV-CLIENT_A-2026-000001' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  creditNoteNumber?: string;

  @ApiPropertyOptional({ example: 'PRICE_CORRECTION' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  reasonCode?: string;

  @ApiPropertyOptional({ example: 'Corrected carrier surcharge after invoice finalization.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ example: [1, 3], description: 'Invoice line numbers to credit. Omit to credit the full finalized invoice.' })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(500)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  invoiceLineNumbers?: number[];

  @ApiPropertyOptional({ example: false, description: 'Create and finalize the credit note in one transaction.' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  finalize?: boolean;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
