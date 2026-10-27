import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { RunQueueWorkerDto } from './dto/run-queue-worker.dto';
import { JobsService } from './jobs.service';
import { QueueWorkerService } from './queue-worker.service';

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly queueWorker: QueueWorkerService,
  ) {}

  @RequirePermissions('job.read')
  @ApiOkResponse({ description: 'Background jobs health.' })
  @Get('health')
  getHealth() {
    return this.jobsService.getHealth();
  }

  @RequirePermissions('job.read')
  @ApiOkResponse({ description: 'Registered background jobs.' })
  @Get()
  listRegistered() {
    return this.jobsService.listRegistered();
  }
  @RequirePermissions('job.manage')
  @ApiOkResponse({ description: 'Run one DB-backed queue worker dispatch cycle.' })
  @Post('queue-worker/run-once')
  runQueueWorkerOnce(@Body() dto: RunQueueWorkerDto) {
    return this.queueWorker.runOnce(dto);
  }

}
