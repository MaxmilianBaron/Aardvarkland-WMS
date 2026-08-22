import { Injectable } from '@nestjs/common';

import { normalizeJobRegistration, summarizeJobsHealth } from './jobs.helpers';
import { ENTERPRISE_JOB_CATALOG } from './enterprise-job-catalog';
import { JobsHealthResponse, RegisteredJobResponse, RegisterJobInput } from './jobs.types';

@Injectable()
export class JobsService {
  private readonly registeredJobs = new Map<string, RegisteredJobResponse>();

  constructor() {
    for (const job of ENTERPRISE_JOB_CATALOG) {
      this.register(job);
    }
  }

  register(input: RegisterJobInput): RegisteredJobResponse {
    const job = normalizeJobRegistration(input);

    this.registeredJobs.set(job.name, job);

    return job;
  }

  listRegistered(): RegisteredJobResponse[] {
    return [...this.registeredJobs.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  getHealth(): JobsHealthResponse {
    return summarizeJobsHealth(this.listRegistered());
  }
}
