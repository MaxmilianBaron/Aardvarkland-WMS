import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class LinkProductCategoryDto {
  @IsString()
  categoryReference!: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
