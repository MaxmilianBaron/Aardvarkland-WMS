import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class RenderLabelPreviewDto {
  @ApiProperty({
    example: {
      widthMm: 100,
      heightMm: 150,
      dpi: 203,
      fields: [{ type: 'qr', x: 6, y: 20, width: 30, height: 30, binding: 'code' }],
    },
  })
  @IsObject()
  layout!: Record<string, unknown>;

  @ApiPropertyOptional({ example: { code: 'AARD1:SKU:MAIN:ABC123', title: 'ABC123' } })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
