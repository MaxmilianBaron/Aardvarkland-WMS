import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../access-control/decorators/require-permissions.decorator';
import { ValidateWorkflowTransitionDto } from './dto/validate-workflow-transition.dto';
import { WorkflowService } from './workflow.service';

@ApiTags('workflow')
@ApiBearerAuth()
@Controller('workflows')
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @RequirePermissions('workflow.read')
  @ApiOkResponse({ description: 'Workflow transition graph for an entity.' })
  @Get(':entity')
  list(@Param('entity') entity: string) {
    return this.workflowService.list(entity);
  }

  @RequirePermissions('workflow.read')
  @ApiOkResponse({ description: 'Allowed workflow transitions from a status.' })
  @Get(':entity/statuses/:status/transitions')
  allowed(@Param('entity') entity: string, @Param('status') status: string) {
    return this.workflowService.allowed(entity, status);
  }

  @RequirePermissions('workflow.read')
  @ApiOkResponse({ description: 'Validate a workflow transition without mutating data.' })
  @Post('validate-transition')
  validate(@Body() dto: ValidateWorkflowTransitionDto) {
    return this.workflowService.validate(dto);
  }
}
