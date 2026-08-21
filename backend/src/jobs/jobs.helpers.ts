import {
  JobRuntimeDriver,
  JobsHealthResponse,
  RegisteredJobResponse,
  RegisterJobInput,
} from './jobs.types';

export function normalizeJobRegistration(input: RegisterJobInput): RegisteredJobResponse {
  return {
    name: normalizeRequired(input.name, 'name'),
    description: normalizeOptional(input.description),
    enabled: input.enabled ?? false,
    schedule: normalizeOptional(input.schedule),
  };
}

export function summarizeJobsHealth(
  jobs: RegisteredJobResponse[],
  now = new Date(),
): JobsHealthResponse {
  return {
    status: 'ok',
    runtimeDriver: JobRuntimeDriver.NONE,
    registeredJobs: jobs.length,
    enabledJobs: jobs.filter((job) => job.enabled).length,
    timestamp: now.toISOString(),
  };
}

function normalizeRequired(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${fieldName} is required`);
  }

  return normalized;
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = value.trim();

  return normalized.length === 0 ? null : normalized;
}
