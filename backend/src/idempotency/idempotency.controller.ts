import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { CheckIdempotencyDto } from './dto/check-idempotency.dto';
import { StoreIdempotencyRecordDto } from './dto/store-idempotency-record.dto';
import { IdempotencyService } from './idempotency.service';

@ApiTags('idempotency')
@ApiBearerAuth()
@Controller('idempotency')
export class IdempotencyController {
  constructor(private readonly idempotencyService: IdempotencyService) {}

  @ApiOkResponse({ description: 'Idempotency lookup result.' })
  @RequirePermissions('idempotency.read')
  @Post('check')
  check(@Body() dto: CheckIdempotencyDto) {
    return this.idempotencyService.check(dto);
  }

  @ApiOkResponse({ description: 'Idempotency record stored or replayed.' })
  @RequirePermissions('idempotency.manage')
  @Post('records')
  store(@Body() dto: StoreIdempotencyRecordDto) {
    return this.idempotencyService.store(dto);
  }
}
