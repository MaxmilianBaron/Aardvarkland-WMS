import { IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class ReceiveReturnLineDto {
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  receivedAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
