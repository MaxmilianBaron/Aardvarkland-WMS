import { Injectable, NotFoundException } from '@nestjs/common';

import {
  evaluateWorkflowTransition,
  getAllowedWorkflowTransitions,
  getWorkflowSummary,
} from './workflow.helpers';
import { ValidateWorkflowTransitionDto } from './dto/validate-workflow-transition.dto';

@Injectable()
export class WorkflowService {
  list(entity: string) {
    const summary = getWorkflowSummary(entity);

    if (!summary) {
      throw new NotFoundException('Workflow entity was not found');
    }

    return summary;
  }

  allowed(entity: string, status: string) {
    return {
      entity,
      status,
      transitions: getAllowedWorkflowTransitions(entity, status),
    };
  }

  validate(dto: ValidateWorkflowTransitionDto) {
    return evaluateWorkflowTransition(dto);
  }
}
