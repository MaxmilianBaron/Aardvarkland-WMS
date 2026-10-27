import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

import { IntegrationDeadLetterStatus } from '../integration-enterprise.types';

export class ResolveDeadLetterDto {
  @IsIn([IntegrationDeadLetterStatus.RESOLVED, IntegrationDeadLetterStatus.IGNORED, IntegrationDeadLetterStatus.REPLAYED])
  status!: 'RESOLVED' | 'IGNORED' | 'REPLAYED';

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
